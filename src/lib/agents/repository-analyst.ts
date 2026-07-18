// CodeInsight AI — Repository Analyst Agent
// Phase 3: Autonomous AI Software Engineer
//
// Analyzes a GitHub repository using the existing parser + analysis
// engine v2 pipeline. Produces a structured AnalysisReport that other
// agents (reviewer, bug-fixer, documenter, ...) can consume via the
// shared context or repository memory.

import type {
  AgentCapability,
  AgentId,
  AgentInfo,
  Task,
  TaskResult,
} from "./types";
import { BaseAgent } from "./base-agent";
import { contextRegistry } from "./shared-context";
import { repositoryMemory } from "./repository-memory";
import type { AIProviderConfig } from "./ai-client";
import type { AnalysisReport } from "@/lib/types";

// ── GitHub fetch helpers (slim re-implementation) ───────────────────────────
const IGNORE_DIRS = [
  "node_modules", "dist", "build", "coverage", "vendor", ".cache", ".git",
  ".next", ".turbo", ".vercel", "__pycache__", ".pytest_cache", "target",
  "bin", "obj", "packages", ".idea", ".vscode",
];
const FETCH_EXTS = [
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs",
  ".cpp", ".c", ".php", ".vue", ".svelte", ".css", ".scss", ".html",
  ".json", ".yml", ".yaml", ".md", ".sh", ".sql", ".rb", ".swift", ".kt",
  ".toml", ".env", ".config",
];
const MAX_FILES = 200;
const MAX_FILE_BYTES = 100_000;
const FETCH_BATCH_SIZE = 10;

interface FetchedFiles {
  files: { path: string; content: string }[];
  branch: string;
}

function githubHeaders(token: string | null, acceptJson = true): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": "CodeInsight-AI-Agent" };
  if (acceptJson) h["Accept"] = "application/vnd.github.v3+json";
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Parse a GitHub URL into owner + repo (best-effort). */
function parseRepoUrlSimple(input: string): { owner: string; repo: string; valid: boolean } {
  const raw = input.trim();
  const m = raw.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?]|$)/i);
  if (m) return { owner: m[1], repo: m[2], valid: true };
  const short = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], repo: short[2], valid: true };
  return { owner: "", repo: "", valid: false };
}

/** Fetch code files from a GitHub repo via the public / authenticated REST API. */
async function fetchRepoFiles(
  owner: string,
  repo: string,
  ghToken: string | null,
  signal: AbortSignal,
  onProgress?: (p: number, msg: string) => void,
): Promise<FetchedFiles> {
  onProgress?.(10, "Fetching repository metadata");
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(ghToken),
    signal,
  });
  if (!repoRes.ok) {
    throw new Error(
      repoRes.status === 404
        ? `GitHub API: repo not found (404) — ${ghToken ? "token lacks access or repo missing" : "repo may be private; sign in with GitHub"}`
        : `GitHub API: repo metadata failed (${repoRes.status})`,
    );
  }
  const repoData = await repoRes.json();
  const branch: string = repoData.default_branch || "main";

  if (signal.aborted) throw new Error("Aborted");

  onProgress?.(25, "Fetching file tree");
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders(ghToken), signal },
  );
  if (!treeRes.ok) throw new Error(`GitHub API: tree fetch failed (${treeRes.status})`);
  const treeData = await treeRes.json();
  const tree: { path: string; type: string; size: number }[] = treeData.tree || [];

  const codeFiles = tree
    .filter(f => f.type === "blob")
    .filter(f => !IGNORE_DIRS.some(d => f.path.startsWith(d + "/") || f.path === d))
    .filter(f => {
      const ext = f.path.substring(f.path.lastIndexOf("."));
      return (
        FETCH_EXTS.includes(ext) ||
        f.path === "package.json" ||
        f.path === "tsconfig.json" ||
        f.path.endsWith(".config.ts") ||
        f.path.endsWith(".config.js")
      );
    })
    .slice(0, MAX_FILES);

  if (codeFiles.length === 0) throw new Error("No analyzable code files found in repository");

  onProgress?.(40, `Downloading ${codeFiles.length} files`);
  const files: { path: string; content: string }[] = [];
  for (let i = 0; i < codeFiles.length && files.length < MAX_FILES; i += FETCH_BATCH_SIZE) {
    if (signal.aborted) throw new Error("Aborted");
    const batch = codeFiles.slice(i, i + FETCH_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async f => {
        const res = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`,
          { headers: githubHeaders(ghToken, false), signal },
        );
        if (!res.ok) return null;
        const content = await res.text();
        if (content.length > MAX_FILE_BYTES) return null;
        return { path: f.path, content };
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) files.push(r.value);
    }
    const pct = 40 + Math.floor(((i + FETCH_BATCH_SIZE) / codeFiles.length) * 25);
    onProgress?.(Math.min(65, pct), `Downloaded ${files.length}/${codeFiles.length} files`);
  }

  if (files.length === 0) throw new Error("Could not fetch any file contents");
  return { files, branch };
}

// ── Repository Analyst Agent ────────────────────────────────────────────────
class RepositoryAnalystAgent extends BaseAgent {
  readonly id: AgentId = "repository-analyst";
  readonly info: AgentInfo = {
    id: "repository-analyst",
    name: "Repository Analyst",
    description: "Deep repository analysis",
    capabilities: [
      { kind: "analyze", description: "Clone, parse, and run static + AI analysis on a GitHub repository" },
    ] as AgentCapability[],
    icon: "FolderSearch",
    color: "#34d399",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = task.input ?? {};
    const repositoryUrl: string | undefined =
      typeof input.repositoryUrl === "string" ? input.repositoryUrl : undefined;
    // Provider is optional — only used for AI-augmented summaries later.
    const _provider: AIProviderConfig | undefined = input.provider as AIProviderConfig | undefined;
    const ghToken: string | null =
      typeof input.githubToken === "string" && input.githubToken.length > 0 ? input.githubToken : null;

    // ── Fast path: caller already supplied an analysis report ──────────────
    const preSupplied = input.analysisReport as AnalysisReport | undefined;
    if (preSupplied && preSupplied.repoUrl) {
      this.log("info", "Using caller-supplied analysis report");
      contextRegistry.recordEvent(task.id, this.id, "analysis-reused", "Used pre-supplied analysis report", "info");
      contextRegistry.setMemory(task.id, "analysisReport", preSupplied);
      contextRegistry.getOrCreate(task.id).analysisReport = preSupplied;
      try {
        await repositoryMemory.remember(preSupplied.repoUrl, "lastAnalysis", preSupplied, "analysis");
      } catch (err: unknown) {
        this.log("warn", `repositoryMemory.remember failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      onProgress(100, "Analysis reused");
      return this.buildResult(preSupplied, true);
    }

    if (!repositoryUrl) {
      return {
        success: false,
        data: null,
        summary: "Repository Analyst: no repositoryUrl supplied and no pre-computed analysisReport",
        artifacts: [],
      };
    }

    const parsed = parseRepoUrlSimple(repositoryUrl);
    if (!parsed.valid) {
      return {
        success: false,
        data: null,
        summary: `Repository Analyst: invalid GitHub URL "${repositoryUrl}"`,
        artifacts: [],
      };
    }

    this.log("info", `Analyzing ${parsed.owner}/${parsed.repo}`);
    contextRegistry.recordEvent(
      task.id,
      this.id,
      "analysis-start",
      `Started analysis of ${parsed.owner}/${parsed.repo}`,
      "info",
    );

    let report: AnalysisReport;
    let usedFallback = false;

    try {
      if (signal.aborted) throw new Error("Aborted");

      // ── Real path: fetch + parse + analyze ───────────────────────────────
      const { files, branch } = await fetchRepoFiles(parsed.owner, parsed.repo, ghToken, signal, onProgress);
      onProgress(75, "Parsing repository structure");

      // Dynamically import so this module stays cheap when not in use.
      const { parseRepository } = await import("@/lib/repo-parser");
      const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");

      if (signal.aborted) throw new Error("Aborted");
      onProgress(85, "Running analyzers (security / bugs / perf / arch)");
      const parsedRepo = parseRepository(
        `https://github.com/${parsed.owner}/${parsed.repo}`,
        parsed.owner,
        parsed.repo,
        branch,
        files,
      );
      report = analyzeParsedRepository(parsedRepo, files);
    } catch (err: unknown) {
      if (signal.aborted) {
        return {
          success: false,
          data: null,
          summary: "Repository Analyst cancelled",
          artifacts: [],
        };
      }
      // ── Fallback: synthesised mock report (matches /api/analyze behaviour) ──
      const msg = err instanceof Error ? err.message : String(err);
      this.log("warn", `GitHub fetch/analyze failed (${msg}); falling back to mock report`);
      contextRegistry.recordEvent(
        task.id,
        this.id,
        "analysis-fallback",
        `Live analysis failed (${msg}); using mock engine`,
        "warn",
      );
      onProgress(85, "Using mock analysis engine (live fetch failed)");
      const { generateReport } = await import("@/lib/analysis-engine");
      report = generateReport(`https://github.com/${parsed.owner}/${parsed.repo}`);
      usedFallback = true;
    }

    // Persist for downstream agents + long-term memory.
    contextRegistry.setMemory(task.id, "analysisReport", report);
    contextRegistry.getOrCreate(task.id).analysisReport = report;
    contextRegistry.getOrCreate(task.id).repositoryUrl = report.repoUrl;
    try {
      await repositoryMemory.remember(report.repoUrl, "lastAnalysis", report, "analysis");
    } catch (err: unknown) {
      this.log("warn", `repositoryMemory.remember failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    contextRegistry.recordEvent(
      task.id,
      this.id,
      "analysis-complete",
      `Analysis complete — score ${report.scores.overall}/100, ${report.totalFiles} files${usedFallback ? " (mock)" : ""}`,
      usedFallback ? "warn" : "info",
      { overallScore: report.scores.overall, totalFiles: report.totalFiles },
    );

    onProgress(100, `Analysis complete — score ${report.scores.overall}/100`);
    return this.buildResult(report, !usedFallback);
  }

  private buildResult(report: AnalysisReport, real: boolean): TaskResult {
    return {
      success: true,
      data: report,
      summary: `Analyzed ${report.repoOwner}/${report.repoName} — overall score ${report.scores.overall}/100 (${report.totalFiles} files, ${report.totalLines} lines)`,
      artifacts: [
        {
          kind: "report",
          content: JSON.stringify(report, null, 2),
          language: "json",
          meta: {
            repoUrl: report.repoUrl,
            overallScore: report.scores.overall,
            totalFiles: report.totalFiles,
            totalLines: report.totalLines,
            real,
          },
        },
      ],
      metrics: {
        overallScore: report.scores.overall,
        securityScore: report.scores.security,
        performanceScore: report.scores.performance,
        architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability,
        codeQualityScore: report.scores.codeQuality,
        totalFiles: report.totalFiles,
        totalLines: report.totalLines,
      },
      followUpTasks: [
        {
          kind: "review",
          title: `Review issues in ${report.repoOwner}/${report.repoName}`,
          priority: "high",
          input: { repositoryUrl: report.repoUrl, analysisReport: report },
        },
      ],
    };
  }
}

export const repositoryAnalystAgent = new RepositoryAnalystAgent();
export { RepositoryAnalystAgent };
