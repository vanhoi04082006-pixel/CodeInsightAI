import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseRepoUrl } from "@/lib/analysis-engine";
import type { AnalysisReport } from "@/lib/types";
import { createJob, startJob, setJobProgress, completeJob, failJob, isCancelled } from "@/lib/job-queue";
import { checkQuota, incrementUsage } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Get the current user's GitHub access token (from session JWT or DB Account).
 * Allows calling GitHub API for the user's PRIVATE repos. Returns null if the
 * user isn't signed in with GitHub (public repos only).
 */
async function getGithubAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  const tokenFromSession = (session as any)?.accessToken as string | undefined;

  // Prefer the token cached in the JWT session
  if (tokenFromSession) return tokenFromSession;

  // Fallback: read directly from the Account table by userId
  if (userId) {
    const account = await db.account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true },
    });
    return account?.access_token ?? null;
  }
  return null;
}

/** Tạo header cho GitHub API, kèm Authorization nếu có token. */
function githubHeaders(token: string | null, acceptJson = true) {
  const headers: Record<string, string> = { "User-Agent": "CodeInsight-AI" };
  if (acceptJson) headers["Accept"] = "application/vnd.github.v3+json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const IGNORE_DIRS = ["node_modules", "dist", "build", "coverage", "vendor", ".cache", ".git", ".next", ".turbo", ".vercel", "__pycache__", ".pytest_cache", "target", "bin", "obj", "packages", ".idea", ".vscode"];
const FETCH_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".php", ".vue", ".svelte", ".css", ".scss", ".html", ".json", ".yml", ".yaml", ".md", ".sh", ".sql", ".rb", ".swift", ".kt", ".toml", ".env", ".config"];
const MAX_FILES = 200;
const CACHE_TTL_MS = 60 * 60 * 1000;
const repoCache = new Map<string, { files: { path: string; content: string }[]; timestamp: number }>();

// POST /api/analyze — starts analysis
export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = await req.json().catch(() => ({}));
    const { repoUrl, force, async: asyncMode } = body as { repoUrl?: string; force?: boolean; async?: boolean };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed.valid) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    // Multi-tenant: each analysis belongs to a user. Anonymous users can't analyze.
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in with GitHub to analyze a repository" }, { status: 401 });
    }

    // Quota enforcement — check before running the analysis
    const quota = await checkQuota(userId, "analysis");
    if (!quota.allowed) {
      return NextResponse.json({
        error: `Analysis quota exceeded (${quota.used}/${quota.limit} this month). Upgrade to Pro for more analyses.`,
        quota,
      }, { status: 429 });
    }

    // ── CACHE CHECK (scoped to this user) ──
    if (!force) {
      const existing = await db.analysis.findFirst({
        where: { userId, repoOwner: parsed.owner, repoName: parsed.name },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const age = Date.now() - existing.createdAt.getTime();
        if (age < CACHE_TTL_MS) {
          let cachedReport: AnalysisReport;
          try { cachedReport = JSON.parse(existing.report); } catch { cachedReport = JSON.parse(existing.report); }
          return NextResponse.json({
            id: existing.id, report: cachedReport, createdAt: existing.createdAt,
            cached: true, real: true, jobId, durationMs: Date.now() - requestStart,
          });
        }
      }
    }

    // ── ASYNC MODE: create background job ──
    if (asyncMode) {
      const job = createJob("analyze");
      const ghToken = await getGithubAccessToken();
      if (!ghToken) {
        console.warn(`[${jobId}] No GitHub token — private repos will fail with 404. User should sign in with GitHub.`);
      }
      // Run analysis in background (non-blocking)
      runAnalysisInBackground(job.id, parsed.owner, parsed.name, parsed.url, !!force, ghToken, userId).catch(e => {
        console.error(`[job ${job.id}] background error:`, e);
        failJob(job.id, e.message || "Unknown error");
      });
      return NextResponse.json({
        jobId: job.id,
        status: "pending",
        message: "Analysis started. Poll GET /api/jobs/[id] for progress.",
      });
    }

    // ── SYNC MODE: run analysis inline ──
    let report: AnalysisReport | null = null;
    let parsedRepoData: any = null;

    try {
      const ghToken = await getGithubAccessToken();
      const result = await fetchAndAnalyzeFromGitHub(parsed.owner, parsed.name, ghToken);
      report = result.report;
      parsedRepoData = result.parsedRepo;
    } catch (e) {
      console.error(`[${jobId}] GitHub fetch failed:`, e);
    }

    if (!report) {
      const { generateReport } = await import("@/lib/analysis-engine");
      report = generateReport(parsed.url);
    }

    // ── Optional Deep AI Analysis (5-pass) ──
    // If Platform AI is configured, run 5 LLM passes for a comprehensive report:
    // 1. Executive Summary, 2. Security Review, 3. Architecture, 4. Code Quality, 5. Priorities
    // Falls back to basic static report if no AI key or if the call fails.
    const enableAiEnhance = body.aiEnhance !== false; // default true
    if (enableAiEnhance && parsedRepoData) {
      try {
        const { runDeepAnalysis } = await import("@/lib/ai-deep-analysis");
        const { getPlatformAIConfig } = await import("@/lib/platform-ai");
        const platformConfig = getPlatformAIConfig();
        if (platformConfig) {
          const deepResult = await runDeepAnalysis(parsedRepoData, report, platformConfig);
          if (deepResult) {
            (report as any).deepAnalysis = deepResult;
            // Also set aiEnhancement for backward compat (badge display)
            (report as any).aiEnhancement = {
              aiSummary: deepResult.executiveSummary,
              aiBadge: "ai-enhanced",
            };
          }
        }
      } catch (e) {
        console.warn(`[${jobId}] Deep AI analysis failed (non-fatal):`, e);
        // Non-fatal — keep the static report
      }
    }

    const getParsedFile = (path: string) => parsedRepoData?.files?.find((f: any) => f.path === path);

    const created = await db.analysis.create({
      data: {
        userId,                          // multi-tenant — attach to current user
        repoUrl: report.repoUrl, repoOwner: report.repoOwner, repoName: report.repoName,
        repoBranch: report.repoBranch, status: "completed",
        overallScore: report.scores.overall, securityScore: report.scores.security,
        performanceScore: report.scores.performance, architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability, codeQualityScore: report.scores.codeQuality,
        primaryLanguage: report.primaryLanguage, totalFiles: report.totalFiles, totalLines: report.totalLines,
        languages: JSON.stringify(report.languages), frameworks: JSON.stringify(report.frameworks),
        report: JSON.stringify(report),
        parsedData: parsedRepoData ? JSON.stringify(parsedRepoData) : null,
        fileSummaries: {
          create: report.files.map(f => ({
            path: f.path, language: f.language, lines: f.lines, complexity: f.complexity,
            description: f.description,
            imports: JSON.stringify(getParsedFile(f.path)?.imports || []),
            exports: JSON.stringify(getParsedFile(f.path)?.exports || []),
            functions: JSON.stringify(getParsedFile(f.path)?.functions || []),
            classes: JSON.stringify(getParsedFile(f.path)?.classes || []),
            components: JSON.stringify(getParsedFile(f.path)?.components || []),
            routes: JSON.stringify(getParsedFile(f.path)?.routes || []),
            issues: f.issues,
          })),
        },
      },
    });

    // Increment usage counter (best-effort — don't fail the analysis if this errors)
    incrementUsage(userId, "analysis").catch(() => { /* silent */ });

    const durationMs = Date.now() - requestStart;
    console.log(`[${jobId}] Analysis complete: ${parsed.owner}/${parsed.name} — ${report.totalFiles} files, ${durationMs}ms`);

    return NextResponse.json({
      id: created.id, report, createdAt: created.createdAt,
      cached: false, real: !!parsedRepoData, jobId, durationMs,
    });
  } catch (e) {
    console.error(`[${jobId}] error:`, e);
    return NextResponse.json({ error: "Failed to analyze repository", jobId }, { status: 500 });
  }
}

async function fetchAndAnalyzeFromGitHub(owner: string, repo: string, ghToken: string | null = null) {
  const cacheKey = `${owner}/${repo}`;
  const memCached = repoCache.get(cacheKey);
  let fileContents: { path: string; content: string }[] = [];
  let branch = "main";

  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
    fileContents = memCached.files;
    console.log(`[cache] IN-MEMORY HIT: ${cacheKey} (${fileContents.length} files)`);
  } else {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: githubHeaders(ghToken),
    });
    if (!repoRes.ok) {
      throw new Error(
        repoRes.status === 404
          ? `GitHub API: repo not found (404). ${
              ghToken
                ? "Token không có quyền truy cập repo này hoặc repo không tồn tại."
                : "Repo có thể là PRIVATE — hãy đăng nhập bằng GitHub để phân tích."
            }`
          : `GitHub API: repo not found (${repoRes.status})`
      );
    }
    const repoData = await repoRes.json();
    branch = repoData.default_branch || "main";

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: githubHeaders(ghToken) });
    if (!treeRes.ok) throw new Error(`GitHub API: tree not found (${treeRes.status})`);
    const treeData = await treeRes.json();
    const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

    const codeFiles = tree
      .filter(f => f.type === "blob")
      .filter(f => !IGNORE_DIRS.some(d => f.path.startsWith(d + "/") || f.path.startsWith(d)))
      .filter(f => { const ext = f.path.substring(f.path.lastIndexOf(".")); return FETCH_EXTS.includes(ext) || f.path === "package.json" || f.path === "tsconfig.json" || f.path.endsWith(".config.ts") || f.path.endsWith(".config.js"); })
      .slice(0, MAX_FILES);

    if (codeFiles.length === 0) throw new Error("No analyzable code files found");

    const batchSize = 10;
    for (let i = 0; i < codeFiles.length && fileContents.length < MAX_FILES; i += batchSize) {
      const batch = codeFiles.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(async f => {
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`, { headers: githubHeaders(ghToken, false) });
        if (!res.ok) return null;
        const content = await res.text();
        if (content.length > 100000) return null;
        return { path: f.path, content };
      }));
      for (const r of results) { if (r.status === "fulfilled" && r.value) fileContents.push(r.value); }
    }
    if (fileContents.length === 0) throw new Error("Could not fetch any file contents");
    repoCache.set(cacheKey, { files: fileContents, timestamp: Date.now() });
  }

  const { parseRepository } = await import("@/lib/repo-parser");
  const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");
  const parsedRepo = parseRepository(`https://github.com/${owner}/${repo}`, owner, repo, branch, fileContents);
  const report = analyzeParsedRepository(parsedRepo, fileContents);
  return { report, parsedRepo };
}

/**
 * Run analysis in background with progress tracking.
 * Updates job status at each stage. Supports cancellation.
 */
async function runAnalysisInBackground(
  jobId: string,
  owner: string,
  repo: string,
  repoUrl: string,
  force: boolean,
  ghToken: string | null = null,
  userId: string | null = null
) {
  startJob(jobId);

  try {
    // Check cache first
    if (!force) {
      setJobProgress(jobId, 5, "Checking cache...");
      const existing = await db.analysis.findFirst({
        where: { userId: userId ?? undefined, repoOwner: owner, repoName: repo },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const age = Date.now() - existing.createdAt.getTime();
        if (age < CACHE_TTL_MS) {
          setJobProgress(jobId, 100, "Cache hit");
          completeJob(jobId, { id: existing.id, cached: true, report: JSON.parse(existing.report) });
          return;
        }
      }
    }

    if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

    // Stage 1: Fetch repo info
    setJobProgress(jobId, 10, "Fetching repository info...");
    const cacheKey = `${owner}/${repo}`;
    const memCached = repoCache.get(cacheKey);
    let fileContents: { path: string; content: string }[] = [];
    let branch = "main";

    if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
      fileContents = memCached.files;
      setJobProgress(jobId, 30, `Using cached files (${fileContents.length})`);
    } else {
      // Fetch repo info
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: githubHeaders(ghToken),
      });
      if (!repoRes.ok) {
        throw new Error(
          repoRes.status === 404
            ? `GitHub API: repo not found (404). ${
                ghToken
                  ? "Token không có quyền truy cập repo này hoặc repo không tồn tại."
                  : "Repo có thể là PRIVATE — hãy đăng nhập bằng GitHub để phân tích."
              }`
            : `GitHub API: repo not found (${repoRes.status})`
        );
      }
      const repoData = await repoRes.json();
      branch = repoData.default_branch || "main";

      if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

      // Stage 2: Fetch file tree
      setJobProgress(jobId, 20, "Fetching file tree...");
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers: githubHeaders(ghToken) });
      if (!treeRes.ok) throw new Error(`GitHub API: tree not found (${treeRes.status})`);
      const treeData = await treeRes.json();
      const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

      const codeFiles = tree
        .filter(f => f.type === "blob")
        .filter(f => !IGNORE_DIRS.some(d => f.path.startsWith(d + "/") || f.path.startsWith(d)))
        .filter(f => { const ext = f.path.substring(f.path.lastIndexOf(".")); return FETCH_EXTS.includes(ext) || f.path === "package.json" || f.path === "tsconfig.json" || f.path.endsWith(".config.ts") || f.path.endsWith(".config.js"); })
        .slice(0, MAX_FILES);

      if (codeFiles.length === 0) throw new Error("No analyzable code files found");

      if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

      // Stage 3: Fetch file contents (with progress)
      setJobProgress(jobId, 30, `Downloading ${codeFiles.length} files...`);
      const batchSize = 10;
      for (let i = 0; i < codeFiles.length && fileContents.length < MAX_FILES; i += batchSize) {
        if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }
        const batch = codeFiles.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async f => {
            const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`, { headers: githubHeaders(ghToken, false) });
            if (!res.ok) return null;
            const content = await res.text();
            if (content.length > 100000) return null;
            return { path: f.path, content };
          })
        );
        for (const r of results) { if (r.status === "fulfilled" && r.value) fileContents.push(r.value); }
        // Update progress: 30-60% range for file download
        const pct = 30 + Math.round((i / codeFiles.length) * 30);
        setJobProgress(jobId, pct, `Downloaded ${fileContents.length}/${codeFiles.length} files`);
      }

      if (fileContents.length === 0) throw new Error("Could not fetch any file contents");
      repoCache.set(cacheKey, { files: fileContents, timestamp: Date.now() });
    }

    if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

    // Stage 4: Parse repository
    setJobProgress(jobId, 65, "Parsing repository structure...");
    const { parseRepository } = await import("@/lib/repo-parser");
    const parsedRepo = parseRepository(`https://github.com/${owner}/${repo}`, owner, repo, branch, fileContents);

    if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

    // Stage 5: Run analyzers
    setJobProgress(jobId, 75, "Running security analysis...");
    const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");
    const report = analyzeParsedRepository(parsedRepo, fileContents);

    if (isCancelled(jobId)) { failJob(jobId, "Cancelled"); return; }

    // Stage 6: Persist to DB
    setJobProgress(jobId, 90, "Saving results...");
    const getParsedFile = (path: string) => parsedRepo.files?.find((f: any) => f.path === path);
    const created = await db.analysis.create({
      data: {
        userId: userId ?? null,            // multi-tenant — attach to current user
        repoUrl: report.repoUrl, repoOwner: report.repoOwner, repoName: report.repoName,
        repoBranch: report.repoBranch, status: "completed",
        overallScore: report.scores.overall, securityScore: report.scores.security,
        performanceScore: report.scores.performance, architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability, codeQualityScore: report.scores.codeQuality,
        primaryLanguage: report.primaryLanguage, totalFiles: report.totalFiles, totalLines: report.totalLines,
        languages: JSON.stringify(report.languages), frameworks: JSON.stringify(report.frameworks),
        report: JSON.stringify(report),
        parsedData: JSON.stringify(parsedRepo),
        fileSummaries: {
          create: report.files.map(f => ({
            path: f.path, language: f.language, lines: f.lines, complexity: f.complexity,
            description: f.description,
            imports: JSON.stringify(getParsedFile(f.path)?.imports || []),
            exports: JSON.stringify(getParsedFile(f.path)?.exports || []),
            functions: JSON.stringify(getParsedFile(f.path)?.functions || []),
            classes: JSON.stringify(getParsedFile(f.path)?.classes || []),
            components: JSON.stringify(getParsedFile(f.path)?.components || []),
            routes: JSON.stringify(getParsedFile(f.path)?.routes || []),
            issues: f.issues,
          })),
        },
      },
    });

    setJobProgress(jobId, 100, "Analysis complete");
    completeJob(jobId, { id: created.id, report, cached: false, real: true });
    console.log(`[job ${jobId}] Background analysis complete: ${owner}/${repo} — ${report.totalFiles} files`);
  } catch (e: any) {
    console.error(`[job ${jobId}] Background analysis failed:`, e);
    failJob(jobId, e.message || "Unknown error");
  }
}

// GET /api/analyze?limit=12
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "12"), 50);
    const rows = await db.analysis.findMany({
      orderBy: { createdAt: "desc" }, take: limit,
      select: { id: true, repoUrl: true, repoOwner: true, repoName: true, repoBranch: true, status: true, overallScore: true, securityScore: true, performanceScore: true, architectureScore: true, maintainabilityScore: true, codeQualityScore: true, primaryLanguage: true, totalFiles: true, totalLines: true, languages: true, frameworks: true, createdAt: true },
    });
    const items = rows.map(r => ({ ...r, languages: safeParse(r.languages, []), frameworks: safeParse(r.frameworks, []) }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [] });
  }
}

function safeParse<T>(s: string, fallback: T): T { try { return JSON.parse(s) as T; } catch { return fallback; } }

// ── ĐOẠN MỚI THÊM: HÀM XỬ LÝ XÓA LỊCH SỬ ──
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing analysis ID" }, { status: 400 });
    }

    // Xóa record trong DB. Note: Nếu bạn có liên kết bảng (Cascade), Prisma sẽ tự xử lý xóa các fileSummaries.
    await db.analysis.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ error: "Failed to delete analysis" }, { status: 500 });
  }
}