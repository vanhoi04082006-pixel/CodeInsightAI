// POST /api/analyze — Hybrid mode: sync static + async AI
// GET /api/analyze — List user's analyses (scoped to userId)
// DELETE /api/analyze?id=X — Delete analysis (ownership checked)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseRepoUrl } from "@/lib/repo-utils";
import type { AnalysisReport } from "@/lib/types";
import { checkQuota, incrementUsage } from "@/lib/billing/usage";
import { loadPolicies } from "@/lib/policies/policy-loader";
import {
  evaluatePolicies,
  hasBlockingViolation,
  blockingViolations,
} from "@/lib/policies/evaluator";
import { getUserPlanInfo } from "@/lib/billing/token-budget";
import {
  enforceRateLimit,
  rateLimit429Body,
  rateLimitHeaders,
  retryAfterSeconds,
  maybeCleanupOldBuckets,
} from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // 120s — sync phase (static analysis + GitHub fetch)

// ── GitHub helpers ──
async function getGithubAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  const tokenFromSession = (session as any)?.accessToken as string | undefined;
  if (tokenFromSession) return tokenFromSession;

  if (userId) {
    const account = await db.account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true, expires_at: true },
    });
    if (account?.access_token) {
      const now = Math.floor(Date.now() / 1000);
      if (account.expires_at && account.expires_at < now) {
        console.warn("[gh-token] EXPIRED — skipping");
      } else {
        return account.access_token;
      }
    }
  }
  return process.env.GITHUB_FALLBACK_TOKEN || process.env.GITHUB_TOKEN || null;
}

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

// ── POST: Hybrid analyze (sync static + async AI) ──
export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { repoUrl, force, platformProvider, platformModel, language } = body as {
      repoUrl?: string; force?: boolean;
      platformProvider?: string; platformModel?: string;
      language?: string;
    };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed.valid) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in with GitHub to analyze a repository" }, { status: 401 });
    }

    // P3.3: per-user hourly rate limit (DB-backed — survives Vercel serverless
    // cold-starts; the in-memory limiter in deprecated in-memory limiter
    // resets per invocation and is dead code in prod). Check happens BEFORE
    // the expensive GitHub fetch + static analysis. Free: 10/h, Pro: 100/h,
    // Team: 500/h, Enterprise: unlimited.
    const planInfo = await getUserPlanInfo(userId);
    const rl = await enforceRateLimit(userId, planInfo.plan, "analysis");
    if (rl.blocked) {
      return NextResponse.json(rateLimit429Body(rl.status!, "analysis"), {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(rl.status)),
          ...rateLimitHeaders(rl.status),
        },
      });
    }
    // Opportunistic cleanup of stale buckets (~1% of requests, fire-and-forget).
    maybeCleanupOldBuckets();

    // Quota
    const quota = await checkQuota(userId, "analysis");
    if (!quota.allowed) {
      return NextResponse.json({
        error: `Analysis quota exceeded (${quota.used}/${quota.limit}). Upgrade to Pro for more.`,
        quota,
      }, { status: 429 });
    }

    // Cache check
    if (!force) {
      const existing = await db.analysis.findFirst({
        where: { userId, repoOwner: parsed.owner, repoName: parsed.name },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const age = Date.now() - existing.createdAt.getTime();
        if (age < CACHE_TTL_MS) {
          const cachedReport = JSON.parse(existing.report);
          return NextResponse.json({
            id: existing.id, report: cachedReport, createdAt: existing.createdAt,
            cached: true, real: true, aiStatus: existing.aiStatus,
            durationMs: Date.now() - requestStart,
          });
        }
      }
    }

    // ── PHASE 1: Sync static analysis (~15-30s) ──
    const ghToken = await getGithubAccessToken();
    let report: AnalysisReport;
    let parsedRepo: any;
    let isPrivate = false;
    try {
      const result = await fetchAndAnalyzeFromGitHub(parsed.owner, parsed.name, ghToken, language);
      report = result.report;
      parsedRepo = result.parsedRepo;
      isPrivate = result.isPrivate;
    } catch (fetchErr: any) {
      console.error("[/api/analyze] GitHub fetch/parse failed:", fetchErr);
      return NextResponse.json({
        error: fetchErr?.message || "Failed to fetch repository from GitHub. Check if the repo exists and is public (or sign in with GitHub for private repos).",
      }, { status: 500 });
    }

    // P3.5: Policy engine — evaluate all enabled policies against this
    // analyze request. Runs AFTER the GitHub fetch (so we know the real
    // file count + languages + visibility) but BEFORE the DB persist (so
    // a blocked request doesn't waste a write). BLOCK-severity → 403 with
    // violation details. WARN-severity policies don't apply at this
    // checkpoint (max-tokens-per-call is enforced in /api/analyze/ai-pass).
    //
    // Fail-open: if loadPolicies() throws (DB error), `policies` is `[]`
    // and evaluatePolicies returns no violations — the request continues.
    const policies = await loadPolicies();
    if (policies.length > 0) {
      const violations = evaluatePolicies(policies, {
        fileCount: report.totalFiles,
        languages: report.languages?.map((l: { name: string }) => l.name),
        isPrivateRepo: isPrivate,
        userId,
        plan: planInfo.plan,
      });
      if (hasBlockingViolation(violations)) {
        return NextResponse.json(
          {
            error: "Policy violation",
            violations: blockingViolations(violations),
          },
          { status: 403 },
        );
      }
    }

    // Persist to DB immediately (aiStatus = "pending" if AI enabled)
    const enableAi = body.aiEnhance !== false;
    const getParsedFile = (path: string) => parsedRepo?.files?.find((f: any) => f.path === path);
    // Initialize the AI-pass completion tracker so readers never see undefined.
    (report as any)._aiPassesCompleted = [];

    const created = await db.analysis.create({
      data: {
        userId,
        repoUrl: report.repoUrl, repoOwner: report.repoOwner, repoName: report.repoName,
        repoBranch: report.repoBranch, status: "completed",
        overallScore: report.scores.overall, securityScore: report.scores.security,
        performanceScore: report.scores.performance, architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability, codeQualityScore: report.scores.codeQuality,
        primaryLanguage: report.primaryLanguage, totalFiles: report.totalFiles, totalLines: report.totalLines,
        languages: JSON.stringify(report.languages), frameworks: JSON.stringify(report.frameworks),
        report: JSON.stringify(report),
        parsedData: parsedRepo ? JSON.stringify(parsedRepo) : null,
        aiStatus: enableAi ? "pending" : "none",
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

    // Persist CodeGraph snapshot (Phase 2) — best-effort, never block analysis on failure
    if (parsedRepo) {
      try {
        const { buildCodeGraph } = await import("@/lib/codegraph/builder");
        const graph = buildCodeGraph(parsedRepo);
        await db.codeGraphSnapshot.create({
          data: {
            analysisId: created.id,
            graph: JSON.stringify(graph),
            nodeCount: graph.nodeCount,
            edgeCount: graph.edgeCount,
            truncated: (graph as any).truncated || false,
          },
        });
      } catch (e) {
        console.warn("[codegraph] snapshot persist failed:", e);
      }
    }

    incrementUsage(userId, "analysis").catch(() => {});

    // ── PHASE 2: AI passes run via /api/analyze/ai-pass (frontend calls) ──
    // No fire-and-forget — frontend calls ai-pass endpoint for each pass
    // This is Hobby-compatible (each pass <60s) and durable (DB tracks status)

    return NextResponse.json({
      id: created.id,
      report,
      createdAt: created.createdAt,
      cached: false,
      real: !!parsedRepo,
      aiStatus: enableAi ? "pending" : "none",
      durationMs: Date.now() - requestStart,
    });
  } catch (e: any) {
    console.error("[/api/analyze] Error:", e);
    // Return actual error message so user knows what went wrong
    const errMsg = e?.message || "Failed to analyze repository";
    return NextResponse.json({
      error: errMsg,
      errorType: e?.code || "unknown",
    }, { status: 500 });
  }
}

// ── Fetch + parse + analyze from GitHub ──
async function fetchAndAnalyzeFromGitHub(owner: string, repo: string, ghToken: string | null = null, language: string = "en") {
  let fileContents: { path: string; content: string }[] = [];
  let branch = "main";

  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(ghToken),
  });
  if (!repoRes.ok) {
    throw new Error(
      repoRes.status === 404
        ? `Repository not found. ${ghToken ? "Token doesn't have access or repo doesn't exist." : "Repo may be PRIVATE — sign in with GitHub."}`
        : repoRes.status === 403
        ? `GitHub rate limit exceeded. ${ghToken ? "Try again later." : "Anonymous limit 60/hour — sign in with GitHub for 5000/hour."}`
        : `GitHub API error (${repoRes.status})`
    );
  }
  const repoData = await repoRes.json();
  branch = repoData.default_branch || "main";
  // P3.5: capture visibility for the `block-private-repos` policy check.
  // GitHub's /repos/{owner}/{repo} response includes `private: true|false`.
  const isPrivate = repoData.private === true;

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders(ghToken) });
  if (!treeRes.ok) throw new Error(`GitHub API: tree not found (${treeRes.status})`);
  const treeData = await treeRes.json();
  const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

  const codeFiles = tree
    .filter(f => f.type === "blob")
    .filter(f => !IGNORE_DIRS.some(d => f.path.startsWith(d + "/") || f.path.startsWith(d)))
    .filter(f => {
      const ext = f.path.substring(f.path.lastIndexOf("."));
      return FETCH_EXTS.includes(ext) || f.path === "package.json" || f.path === "tsconfig.json";
    })
    .slice(0, MAX_FILES);

  if (codeFiles.length === 0) throw new Error("No analyzable code files found in repository");

  // Download files in batches
  const batchSize = 10;
  for (let i = 0; i < codeFiles.length; i += batchSize) {
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

  if (fileContents.length === 0) throw new Error("Could not fetch any file contents from repository");

  const { parseRepository } = await import("@/lib/repo-parser");
  const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");
  const parsedRepo = parseRepository(`https://github.com/${owner}/${repo}`, owner, repo, branch, fileContents);
  const report = analyzeParsedRepository(parsedRepo, fileContents, language);
  return { report, parsedRepo, isPrivate };
}

// ── GET: List user's analyses (SCOPED to userId — security fix) ──
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ items: [] });

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "12"), 50);
    const rows = await db.analysis.findMany({
      where: { userId }, // CRITICAL FIX: scope to user
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, repoUrl: true, repoOwner: true, repoName: true, repoBranch: true,
        status: true, overallScore: true, securityScore: true, performanceScore: true,
        architectureScore: true, maintainabilityScore: true, codeQualityScore: true,
        primaryLanguage: true, totalFiles: true, totalLines: true,
        languages: true, frameworks: true, createdAt: true, aiStatus: true,
      },
    });
    const items = rows.map(r => ({
      ...r,
      languages: safeParse(r.languages, []),
      frameworks: safeParse(r.frameworks, []),
    }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ── DELETE: Delete analysis (OWNERSHIP CHECK — security fix) ──
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing analysis ID" }, { status: 400 });

    // CRITICAL FIX: check ownership before delete
    const analysis = await db.analysis.findUnique({ where: { id }, select: { userId: true } });
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: "Analysis not found or not owned by you" }, { status: 404 });
    }

    await db.analysis.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ error: "Failed to delete analysis" }, { status: 500 });
  }
}
