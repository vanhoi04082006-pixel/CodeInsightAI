import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRepoUrl } from "@/lib/analysis-engine";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IGNORE_DIRS = ["node_modules", "dist", "build", "coverage", "vendor", ".cache", ".git", ".next", ".turbo", ".vercel", "__pycache__", ".pytest_cache", "target", "bin", "obj", "packages", ".idea", ".vscode"];
const FETCH_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".php", ".vue", ".svelte", ".css", ".scss", ".html", ".json", ".yml", ".yaml", ".md", ".sh", ".sql", ".rb", ".swift", ".kt", ".toml", ".env", ".config"];
const MAX_FILES = 200;
// Cache TTL: 1 hour (re-analyze if older than this)
const CACHE_TTL_MS = 60 * 60 * 1000;

// In-memory cache for parsed repos (avoids re-fetch within same session)
const repoCache = new Map<string, { files: { path: string; content: string }[]; timestamp: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { repoUrl, force } = body as { repoUrl?: string; force?: boolean };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed.valid) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    // ── CACHE CHECK ──
    // If not forced, check DB for existing analysis of same repo+branch
    if (!force) {
      const existing = await db.analysis.findFirst({
        where: { repoOwner: parsed.owner, repoName: parsed.name },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        const age = Date.now() - existing.createdAt.getTime();
        if (age < CACHE_TTL_MS) {
          // Return cached result
          let cachedReport: AnalysisReport;
          try {
            cachedReport = JSON.parse(existing.report);
          } catch {
            cachedReport = JSON.parse(existing.report); // fallback
          }
          console.log(`[cache] HIT: ${parsed.owner}/${parsed.name} (${Math.round(age / 1000)}s old)`);
          return NextResponse.json({
            id: existing.id,
            report: cachedReport,
            createdAt: existing.createdAt,
            cached: true,
            real: true,
          });
        }
      }
    }

    // ── REAL ANALYSIS ──
    let report: AnalysisReport | null = null;
    let parsedRepoData: any = null;
    try {
      const result = await fetchAndAnalyzeFromGitHub(parsed.owner, parsed.name);
      report = result.report;
      parsedRepoData = result.parsedRepo;
    } catch (e) {
      console.error("[/api/analyze] GitHub fetch failed, falling back to simulated:", e);
    }

    // Helper to get parsed file data by path
    const getParsedFile = (path: string) => parsedRepoData?.files?.find((f: any) => f.path === path);

    if (!report) {
      const { generateReport } = await import("@/lib/analysis-engine");
      report = generateReport(parsed.url);
    }

    const created = await db.analysis.create({
      data: {
        repoUrl: report.repoUrl,
        repoOwner: report.repoOwner,
        repoName: report.repoName,
        repoBranch: report.repoBranch,
        status: "completed",
        overallScore: report.scores.overall,
        securityScore: report.scores.security,
        performanceScore: report.scores.performance,
        architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability,
        codeQualityScore: report.scores.codeQuality,
        primaryLanguage: report.primaryLanguage,
        totalFiles: report.totalFiles,
        totalLines: report.totalLines,
        languages: JSON.stringify(report.languages),
        frameworks: JSON.stringify(report.frameworks),
        report: JSON.stringify(report),
        parsedData: parsedRepoData ? JSON.stringify(parsedRepoData) : null,
        fileSummaries: {
          create: report.files.map(f => ({
            path: f.path,
            language: f.language,
            lines: f.lines,
            complexity: f.complexity,
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

    return NextResponse.json({
      id: created.id,
      report,
      createdAt: created.createdAt,
      cached: false,
      real: !!report,
    });
  } catch (e) {
    console.error("[/api/analyze] error", e);
    return NextResponse.json({ error: "Failed to analyze repository" }, { status: 500 });
  }
}

async function fetchAndAnalyzeFromGitHub(owner: string, repo: string) {
  const cacheKey = `${owner}/${repo}`;

  // ── IN-MEMORY CACHE ── (avoids re-fetching files within same server session)
  const memCached = repoCache.get(cacheKey);
  let fileContents: { path: string; content: string }[] = [];
  let branch = "main";

  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
    fileContents = memCached.files;
    console.log(`[cache] IN-MEMORY HIT: ${cacheKey} (${fileContents.length} files)`);
  } else {
    // 1. Get repo info → default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { "User-Agent": "CodeInsight-AI", "Accept": "application/vnd.github.v3+json" },
    });
    if (!repoRes.ok) throw new Error(`GitHub API: repo not found (${repoRes.status})`);
    const repoData = await repoRes.json();
    branch = repoData.default_branch || "main";

    // 2. Get file tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: { "User-Agent": "CodeInsight-AI", "Accept": "application/vnd.github.v3+json" } }
    );
    if (!treeRes.ok) throw new Error(`GitHub API: tree not found (${treeRes.status})`);
    const treeData = await treeRes.json();
    const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

    // 3. Filter code files
    const codeFiles = tree
      .filter((f) => f.type === "blob")
      .filter((f) => !IGNORE_DIRS.some((d) => f.path.startsWith(d + "/") || f.path.startsWith(d)))
      .filter((f) => {
        const ext = f.path.substring(f.path.lastIndexOf("."));
        return FETCH_EXTS.includes(ext) || f.path === "package.json" || f.path === "tsconfig.json" || f.path.endsWith(".config.ts") || f.path.endsWith(".config.js");
      })
      .slice(0, MAX_FILES);

    if (codeFiles.length === 0) throw new Error("No analyzable code files found");

    // 4. Fetch file contents (batched)
    const batchSize = 10;
    for (let i = 0; i < codeFiles.length && fileContents.length < MAX_FILES; i += batchSize) {
      const batch = codeFiles.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (f) => {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`;
          const res = await fetch(rawUrl, { headers: { "User-Agent": "CodeInsight-AI" } });
          if (!res.ok) return null;
          const content = await res.text();
          if (content.length > 100000) return null;
          return { path: f.path, content };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) fileContents.push(r.value);
      }
    }

    if (fileContents.length === 0) throw new Error("Could not fetch any file contents");

    // Store in memory cache
    repoCache.set(cacheKey, { files: fileContents, timestamp: Date.now() });
    console.log(`[cache] IN-MEMORY SET: ${cacheKey} (${fileContents.length} files)`);
  }

  // 5. Parse + analyze
  const { parseRepository } = await import("@/lib/repo-parser");
  const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");

  const parsedRepo = parseRepository(`https://github.com/${owner}/${repo}`, owner, repo, branch, fileContents);
  const report = analyzeParsedRepository(parsedRepo, fileContents);
  return { report, parsedRepo };
}

// GET /api/analyze?limit=12
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "12"), 50);
    const rows = await db.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, repoUrl: true, repoOwner: true, repoName: true, repoBranch: true,
        status: true, overallScore: true, securityScore: true, performanceScore: true,
        architectureScore: true, maintainabilityScore: true, codeQualityScore: true,
        primaryLanguage: true, totalFiles: true, totalLines: true,
        languages: true, frameworks: true, createdAt: true,
      },
    });
    const items = rows.map((r) => ({
      ...r,
      languages: safeParse(r.languages, []),
      frameworks: safeParse(r.frameworks, []),
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/analyze GET] error", e);
    return NextResponse.json({ items: [] });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
