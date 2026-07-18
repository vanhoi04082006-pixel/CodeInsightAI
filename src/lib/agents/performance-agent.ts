// CodeInsight AI — Performance Agent (perf audit prompt)
// Runs `analyzePerformance` + `getPositiveFindings` first, then optionally asks the AI to
// prioritize the top 5 issues and propose specific optimizations. Falls back to static results.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";
import { analyzePerformance, getPositiveFindings } from "@/lib/analyzers/performance";
import type { Issue } from "@/lib/types";

/* ────────────── Input shapes ────────────── */

interface SourceFile {
  path: string;
  content: string;
}

interface PerfInput {
  files?: SourceFile[];
  provider?: AIProviderConfig;
  repositoryUrl?: string;
}

/* ────────────── Output shapes ────────────── */

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface TopIssue {
  title: string;
  impact: string;
  file: string;
  fix: string;
  estimatedSpeedup: string;
}

interface PerfReport {
  score: number; // 0-100
  topIssues: TopIssue[];
  optimizations: string[];
  summary: string;
  positiveFindings?: string[];
}

/* ────────────── Agent ────────────── */

export class PerformanceAgent extends BaseAgent {
  readonly id: AgentId = "performance-agent";
  readonly info: AgentInfo = {
    id: "performance-agent",
    name: "Performance Agent",
    description:
      "Audits performance: runs static analyzers, then optionally uses AI to prioritize top issues, propose specific optimizations, and estimate speedups.",
    capabilities: [
      { kind: "perf-audit", description: "Produce a performance audit report with score, prioritized issues, and optimizations." },
    ],
    icon: "Gauge",
    color: "#22d3ee",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as PerfInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const files = (input.files ?? []).filter(f => f && typeof f.path === "string" && typeof f.content === "string");

    onProgress(10, "Running static performance analyzer");
    const staticIssues = analyzePerformance(files);
    const positives = getPositiveFindings(files);
    if (signal.aborted) return cancelled(this.info.name);

    let report: PerfReport;
    if (provider && files.length > 0) {
      onProgress(40, "Asking AI to prioritize top 5 issues and propose optimizations");
      try {
        report = await this.deepAuditWithAI(provider, files, staticIssues, positives, signal, onProgress);
      } catch (err) {
        this.log("warn", `AI perf audit failed — using static results: ${(err as Error).message}`);
        report = staticReport(staticIssues, positives);
      }
    } else {
      onProgress(40, "No AI provider — returning static analyzer results");
      report = staticReport(staticIssues, positives);
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(100, "Performance audit complete");
    this.recordDecision(
      task.id,
      `Perf audit complete — score ${report.score}/100, ${report.topIssues.length} top issue(s)`,
      report.summary,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(repoUrl, `perf:${task.id}`, report, "decision");
      } catch {
        // best-effort
      }
    }

    this.log("info", `Perf audit — score ${report.score}/100, ${report.topIssues.length} top issues.`);

    const markdown = renderPerfReport(report);

    return {
      success: true,
      data: report,
      summary: `Performance audit: score=${report.score}/100, ${report.topIssues.length} top issue(s)`,
      artifacts: [
        {
          kind: "report",
          path: "performance-audit.md",
          content: markdown,
          language: "markdown",
          meta: { score: report.score, topIssues: report.topIssues.length },
        },
      ],
      metrics: {
        score: report.score,
        topIssues: report.topIssues.length,
        optimizations: report.optimizations.length,
        staticIssues: staticIssues.length,
      },
    };
  }

  /* ────── AI deep audit ────── */

  private async deepAuditWithAI(
    provider: AIProviderConfig,
    files: SourceFile[],
    staticIssues: Issue[],
    positives: string[],
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<PerfReport> {
    const topStatic = [...staticIssues].sort(bySeverityDesc).slice(0, 15);
    const staticBlock = topStatic
      .map(i => `- [${i.severity}] ${i.title} @ ${i.file}:${i.line ?? "?"} — ${i.recommendation}`)
      .join("\n");
    const fileBlocks = files
      .slice(0, 15)
      .map(f => `### ${f.path}\n\`\`\`\n${truncate(f.content, 3000)}\n\`\`\``)
      .join("\n\n");
    const positiveBlock = positives.length > 0 ? positives.map(p => `- ${p}`).join("\n") : "(none)";

    const system: AIMessage = {
      role: "system",
      content:
        "You are a performance engineering expert. Prioritize the top 5 most impactful issues and propose concrete, actionable optimizations with realistic speedup estimates. " +
        "Return STRICT JSON only — no prose outside the JSON.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        "Audit the performance of the code below. Use the static-analyzer findings as a starting point — confirm, prioritize, and ADD any issues the static analyzer missed. " +
        "Return JSON in EXACTLY this shape:\n" +
        "```json\n" +
        "{\n" +
        '  "score": <number 0-100>,\n' +
        '  "topIssues": [\n' +
        '    { "title": "<short title>", "impact": "<what it affects>", "file": "<path>", "fix": "<specific fix>", "estimatedSpeedup": "<e.g. ~30% faster renders>" }\n' +
        "  ],\n" +
        '  "optimizations": ["<general optimization suggestion>", "..."],\n' +
        '  "summary": "<1-3 sentence overall assessment>"\n' +
        "}\n" +
        "```\n" +
        "Limit topIssues to the 5 highest-impact items.\n\n" +
        `### STATIC ANALYZER FINDINGS\n${staticBlock || "(none)"}\n\n` +
        `### POSITIVE FINDINGS (already-good patterns)\n${positiveBlock}\n\n` +
        `### SOURCE FILES\n${fileBlocks || "(none)"}`.trim(),
    };

    onProgress(70, "Calling AI for structured performance report");
    const raw = await callAIForJSON<Partial<PerfReport>>(provider, [system, user], {
      temperature: 0.2,
      maxTokens: 6000,
      signal,
    });
    return mergeReport(staticIssues, positives, raw);
  }
}

/* ────────────── Static-only report ────────────── */

function staticReport(staticIssues: Issue[], positives: string[]): PerfReport {
  const topIssues: TopIssue[] = [...staticIssues]
    .sort(bySeverityDesc)
    .slice(0, 5)
    .map(i => ({
      title: i.title,
      impact: i.description,
      file: i.file,
      fix: i.recommendation,
      estimatedSpeedup: estimateSpeedup(i),
    }));
  const score = computeScore(staticIssues);
  const optimizations = dedupe(
    staticIssues.map(i => i.recommendation),
  ).slice(0, 10);
  const summary =
    staticIssues.length === 0
      ? `No performance issues detected. ${positives.length} positive pattern(s) found.`
      : `Static analysis detected ${staticIssues.length} performance issue(s); top ${topIssues.length} listed. Score: ${score}/100.`;
  return { score, topIssues, optimizations, summary, positiveFindings: positives };
}

/* ────────────── Merge AI + static ─────────────️ */

function mergeReport(staticIssues: Issue[], positives: string[], raw: Partial<PerfReport>): PerfReport {
  const aiTop = Array.isArray(raw.topIssues)
    ? raw.topIssues
        .filter(t => t && typeof t === "object")
        .map(t => ({
          title: typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Performance issue",
          impact: typeof t.impact === "string" && t.impact.trim() ? t.impact.trim() : "Impact unknown",
          file: typeof t.file === "string" ? t.file : "unknown",
          fix: typeof t.fix === "string" && t.fix.trim() ? t.fix.trim() : "Review and optimize.",
          estimatedSpeedup:
            typeof t.estimatedSpeedup === "string" && t.estimatedSpeedup.trim()
              ? t.estimatedSpeedup.trim()
              : "unknown",
        }))
    : [];

  // If AI didn't return top issues, fall back to static.
  const topIssues: TopIssue[] = aiTop.length > 0 ? aiTop.slice(0, 5) : staticReport(staticIssues, positives).topIssues;

  const optimizations = Array.isArray(raw.optimizations)
    ? raw.optimizations.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map(s => s.trim())
    : dedupe(staticIssues.map(i => i.recommendation)).slice(0, 10);

  const score =
    typeof raw.score === "number" && raw.score >= 0 && raw.score <= 100
      ? Math.round(raw.score)
      : computeScore(staticIssues);

  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : `Performance audit complete — score ${score}/100, ${topIssues.length} top issue(s).`;

  return { score, topIssues, optimizations, summary, positiveFindings: positives };
}

/* ────────────── Scoring helpers ────────────── */

function computeScore(staticIssues: Issue[]): number {
  const weights: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2, info: 1 };
  const penalty = staticIssues.reduce((s, i) => s + (weights[i.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function estimateSpeedup(i: Issue): string {
  const cat = i.category?.toLowerCase() ?? "";
  if (cat === "bundle") return "smaller initial bundle (~10-30% reduction)";
  if (cat === "render") return "fewer re-renders (~10-50% faster interactions)";
  if (cat === "async") return "~2-10x parallel speedup for batch ops";
  if (cat === "query") return "~N× faster for N records (eliminates N+1)";
  if (cat === "blocking") return "unblocks event loop (~100ms+ per request)";
  if (cat === "memory") return "eliminates leaks (long-running stability)";
  if (cat === "next") return "improved Core Web Vitals (LCP/INP)";
  return "moderate improvement";
}

function severityRank(s: Severity): number {
  const rank: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return rank[s] ?? 0;
}

function bySeverityDesc(a: Issue, b: Issue): number {
  return severityRank(b.severity) - severityRank(a.severity);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const key = i.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(i);
    }
  }
  return out;
}

/* ────────────── Rendering ────────────── */

function renderPerfReport(report: PerfReport): string {
  const lines: string[] = [];
  lines.push("# Performance Audit Report");
  lines.push("");
  lines.push(`**Score:** ${report.score}/100`);
  lines.push(`**Top issues:** ${report.topIssues.length}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.topIssues.length > 0) {
    lines.push("## Top Issues (prioritized)");
    lines.push("");
    for (let i = 0; i < report.topIssues.length; i++) {
      const t = report.topIssues[i];
      lines.push(`### ${i + 1}. ${t.title}`);
      lines.push(`- **File:** \`${t.file}\``);
      lines.push(`- **Impact:** ${t.impact}`);
      lines.push(`- **Fix:** ${t.fix}`);
      lines.push(`- **Estimated speedup:** ${t.estimatedSpeedup}`);
      lines.push("");
    }
  } else {
    lines.push("_No top performance issues identified._");
    lines.push("");
  }

  if (report.optimizations.length > 0) {
    lines.push("## General Optimizations");
    lines.push("");
    for (const o of report.optimizations) lines.push(`- ${o}`);
    lines.push("");
  }

  if (report.positiveFindings && report.positiveFindings.length > 0) {
    lines.push("## Positive Patterns Already Present");
    lines.push("");
    for (const p of report.positiveFindings) lines.push(`- ${p}`);
    lines.push("");
  }

  return lines.join("\n");
}

/* ────────────── Misc helpers ─────────────️ */

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… [truncated]";
}

function cancelled(agentName: string): TaskResult {
  return {
    success: false,
    data: null,
    summary: `${agentName} cancelled before completion.`,
    artifacts: [],
  };
}

export const performanceAgent = new PerformanceAgent();
