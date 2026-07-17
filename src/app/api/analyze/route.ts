import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRepoUrl } from "@/lib/analysis-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Directories to ignore when fetching from GitHub
const IGNORE_DIRS = ["node_modules", "dist", "build", "coverage", "vendor", ".cache", ".git", ".next", ".turbo", ".vercel", "__pycache__", ".pytest_cache", "target", "bin", "obj", "packages", ".idea", ".vscode"];
// File extensions to fetch (skip binaries)
const FETCH_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".php", ".vue", ".svelte", ".css", ".scss", ".html", ".json", ".yml", ".yaml", ".md", ".sh", ".sql", ".rb", ".swift", ".kt", ".toml", ".env", ".config"];
const MAX_FILES = 200; // limit to avoid timeout

// POST /api/analyze { repoUrl }
// Fetches REAL files from GitHub, parses them, runs real analyzers.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { repoUrl } = body as { repoUrl?: string };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed.valid) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo." },
        { status: 400 }
      );
    }

    // Try to fetch real files from GitHub API
    let realReport = null;
    try {
      realReport = await fetchAndAnalyzeFromGitHub(parsed.owner, parsed.name);
    } catch (e) {
      console.error("[/api/analyze] GitHub fetch failed, falling back to simulated:", e);
    }

    let report;
    if (realReport) {
      report = realReport;
    } else {
      // Fallback: simulated report (if GitHub API fails — private repo, rate limit, etc.)
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
      },
    });

    return NextResponse.json({
      id: created.id,
      report,
      createdAt: created.createdAt,
      real: !!realReport, // indicates whether real files were analyzed
    });
  } catch (e) {
    console.error("[/api/analyze] error", e);
    return NextResponse.json({ error: "Failed to analyze repository" }, { status: 500 });
  }
}

/**
 * Fetch real files from GitHub and analyze them.
 * Uses GitHub's public API (no auth needed for public repos).
 */
async function fetchAndAnalyzeFromGitHub(owner: string, repo: string) {
  // 1. Get repo info to find the default branch
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { "User-Agent": "CodeInsight-AI", "Accept": "application/vnd.github.v3+json" },
  });
  if (!repoRes.ok) throw new Error(`GitHub API: repo not found (${repoRes.status})`);
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || "main";

  // 2. Get file tree
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const treeRes = await fetch(treeUrl, {
    headers: { "User-Agent": "CodeInsight-AI", "Accept": "application/vnd.github.v3+json" },
  });

  if (!treeRes.ok) {
    throw new Error(`GitHub API returned ${treeRes.status}`);
  }

  const treeData = await treeRes.json();
  const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

  // 2. Filter files: code files only, skip ignored dirs, limit count
  const codeFiles = tree
    .filter((f) => f.type === "blob")
    .filter((f) => !IGNORE_DIRS.some((d) => f.path.startsWith(d + "/") || f.path.startsWith(d)))
    .filter((f) => {
      const ext = f.path.substring(f.path.lastIndexOf("."));
      return FETCH_EXTS.includes(ext) || f.path === "package.json" || f.path === "tsconfig.json" || f.path.endsWith(".config.ts") || f.path.endsWith(".config.js");
    })
    .slice(0, MAX_FILES);

  if (codeFiles.length === 0) {
    throw new Error("No analyzable code files found in repository");
  }

  // 3. Fetch file contents (batch — use raw.githubusercontent.com)
  const fileContents: { path: string; content: string }[] = [];
  const batchSize = 10;

  for (let i = 0; i < codeFiles.length && fileContents.length < MAX_FILES; i += batchSize) {
    const batch = codeFiles.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (f) => {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`;
        const res = await fetch(rawUrl, {
          headers: { "User-Agent": "CodeInsight-AI" },
        });
        if (!res.ok) return null;
        const content = await res.text();
        // Skip if too large (> 100KB)
        if (content.length > 100000) return null;
        return { path: f.path, content };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        fileContents.push(r.value);
      }
    }
  }

  if (fileContents.length === 0) {
    throw new Error("Could not fetch any file contents from GitHub");
  }

  // 4. Parse repository + run real analyzers
  const { parseRepository } = await import("@/lib/repo-parser");
  const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");

  const parsedRepo = parseRepository(
    `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    branch,
    fileContents
  );

  const report = analyzeParsedRepository(parsedRepo, fileContents);
  return report;
}

// GET /api/analyze?limit=12 → recent analyses
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
