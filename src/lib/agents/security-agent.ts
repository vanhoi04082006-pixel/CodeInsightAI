// CodeInsight AI — Security Agent (security audit prompt)
// Runs the static `analyzeSecurity` first, then optionally asks the AI to deepen the audit
// and propose concrete fixes. Falls back to the static results when no provider is configured.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";
import { analyzeSecurity } from "@/lib/analyzers/security";
import type { Issue } from "@/lib/types";

/* ────────────── Input shapes ────────────── */

interface SourceFile {
  path: string;
  content: string;
}

interface SecurityInput {
  files?: SourceFile[];
  provider?: AIProviderConfig;
  repositoryUrl?: string;
}

/* ────────────── Output shapes ────────────── */

type Risk = "low" | "medium" | "high" | "critical";
type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SecurityFinding {
  issue: string;
  severity: Severity;
  file: string;
  line: number;
  recommendation: string;
  cwe?: string;
}

interface SecurityReport {
  overallRisk: Risk;
  findings: SecurityFinding[];
  summary: string;
}

/* ────────────── Agent ────────────── */

export class SecurityAgent extends BaseAgent {
  readonly id: AgentId = "security-agent";
  readonly info: AgentInfo = {
    id: "security-agent",
    name: "Security Agent",
    description:
      "Performs security audits: runs static analyzers, then optionally uses AI to deepen the review, propose fixes, and assign CWE identifiers.",
    capabilities: [
      { kind: "security-audit", description: "Produce a security audit report with risk rating, findings, and recommendations." },
    ],
    icon: "ShieldAlert",
    color: "#f472b6",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as SecurityInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const files = (input.files ?? []).filter(f => f && typeof f.path === "string" && typeof f.content === "string");

    onProgress(10, "Running static security analyzer");
    const staticIssues = analyzeSecurity(files);
    if (signal.aborted) return cancelled(this.info.name);

    let report: SecurityReport;

    if (provider && files.length > 0) {
      onProgress(40, "Asking AI for deeper review of critical issues");
      try {
        report = await this.deepReviewWithAI(provider, files, staticIssues, signal, onProgress);
      } catch (err) {
        this.log("warn", `AI security review failed — using static results: ${(err as Error).message}`);
        report = staticReport(staticIssues);
      }
    } else {
      onProgress(40, "No AI provider — returning static analyzer results");
      report = staticReport(staticIssues);
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(100, "Security audit complete");
    this.recordDecision(
      task.id,
      `Security audit complete — risk ${report.overallRisk}, ${report.findings.length} finding(s)`,
      report.summary,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(repoUrl, `security:${task.id}`, report, "decision");
      } catch {
        // best-effort
      }
    }

    this.log("info", `Security audit — risk ${report.overallRisk}, ${report.findings.length} finding(s).`);

    const markdown = renderSecurityReport(report);

    return {
      success: true,
      data: report,
      summary: `Security audit: risk=${report.overallRisk}, ${report.findings.length} finding(s)`,
      artifacts: [
        {
          kind: "report",
          path: "security-audit.md",
          content: markdown,
          language: "markdown",
          meta: { overallRisk: report.overallRisk, findingCount: report.findings.length },
        },
      ],
      metrics: {
        findings: report.findings.length,
        critical: report.findings.filter(f => f.severity === "critical").length,
        high: report.findings.filter(f => f.severity === "high").length,
      },
    };
  }

  /* ────── AI deep review ────── */

  private async deepReviewWithAI(
    provider: AIProviderConfig,
    files: SourceFile[],
    staticIssues: Issue[],
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<SecurityReport> {
    // Pick the top critical/high issues to feed to the AI (keep prompt small).
    const topIssues = [...staticIssues]
      .sort(bySeverityDesc)
      .slice(0, 12)
      .map(i => `- [${i.severity}] ${i.title} @ ${i.file}:${i.line ?? "?"} — ${i.description}`);

    const fileBlocks = files
      .slice(0, 15)
      .map(f => `### ${f.path}\n\`\`\`\n${truncate(f.content, 3000)}\n\`\`\``)
      .join("\n\n");

    const system: AIMessage = {
      role: "system",
      content:
        "You are an application security engineer performing a deep manual review. " +
        "Identify vulnerabilities, map each to a CWE where possible, and provide a concrete, actionable recommendation. " +
        "Return STRICT JSON only — no prose outside the JSON.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        "Perform a security review of the code below. Use the static-analyzer findings as a starting point — confirm, refine, and ADD any issues the static analyzer missed. " +
        "Return JSON in EXACTLY this shape:\n" +
        "```json\n" +
        "{\n" +
        '  "overallRisk": "low" | "medium" | "high" | "critical",\n' +
        '  "findings": [\n' +
        '    { "issue": "<short title>", "severity": "critical|high|medium|low|info", "file": "<path>", "line": <number>, "recommendation": "<fix>", "cwe": "<CWE-XXX>" }\n' +
        "  ],\n" +
        '  "summary": "<1-3 sentence overall assessment>"\n' +
        "}\n" +
        "```\n\n" +
        `### STATIC ANALYZER FINDINGS\n${topIssues.join("\n") || "(none)"}\n\n` +
        `### SOURCE FILES\n${fileBlocks || "(none)"}`.trim(),
    };

    onProgress(70, "Calling AI for structured security report");
    const raw = await callAIForJSON<Partial<SecurityReport>>(provider, [system, user], {
      temperature: 0.2,
      maxTokens: 6000,
      signal,
    });
    return mergeWithStatic(staticIssues, raw);
  }
}

/* ────────────── Static-only report (no provider) ────────────── */

function staticReport(staticIssues: Issue[]): SecurityReport {
  const findings: SecurityFinding[] = staticIssues.map(i => ({
    issue: i.title,
    severity: i.severity,
    file: i.file,
    line: i.line ?? 1,
    recommendation: i.recommendation,
    cwe: inferCWE(i),
  }));
  const overallRisk = computeRisk(findings);
  const summary =
    findings.length === 0
      ? "No security issues detected by static analysis."
      : `Static analysis detected ${findings.length} security issue(s). Overall risk: ${overallRisk}.`;
  return { overallRisk, findings, summary };
}

/* ────────────── Merge AI report with static findings ─────────────️ */

function mergeWithStatic(staticIssues: Issue[], raw: Partial<SecurityReport>): SecurityReport {
  const aiFindings = Array.isArray(raw.findings)
    ? raw.findings
        .filter(f => f && typeof f === "object")
        .map(f => ({
          issue: typeof f.issue === "string" && f.issue.trim() ? f.issue.trim() : "Security issue",
          severity: clampSeverity(f.severity),
          file: typeof f.file === "string" ? f.file : "unknown",
          line: typeof f.line === "number" && f.line > 0 ? Math.floor(f.line) : 1,
          recommendation:
            typeof f.recommendation === "string" && f.recommendation.trim()
              ? f.recommendation.trim()
              : "Review and remediate.",
          cwe: typeof f.cwe === "string" && f.cwe.trim() ? f.cwe.trim() : undefined,
        }))
    : [];

  // Start from static findings (always present), then add AI-only findings (those without a close static match).
  const merged: SecurityFinding[] = staticIssues.map(i => ({
    issue: i.title,
    severity: i.severity,
    file: i.file,
    line: i.line ?? 1,
    recommendation: i.recommendation,
    cwe: inferCWE(i),
  }));

  for (const ai of aiFindings) {
    const isDupe = merged.some(
      m =>
        m.file === ai.file &&
        Math.abs(m.line - ai.line) <= 5 &&
        (m.issue.toLowerCase() === ai.issue.toLowerCase() ||
          m.recommendation.toLowerCase() === ai.recommendation.toLowerCase()),
    );
    if (!isDupe) merged.push(ai);
  }

  // Sort by severity.
  merged.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const overallRisk = clampRisk(raw.overallRisk) ?? computeRisk(merged);
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : `Security review complete — ${merged.length} finding(s), overall risk: ${overallRisk}.`;

  return { overallRisk, findings: merged, summary };
}

/* ────────────── Risk + severity helpers ────────────── */

function computeRisk(findings: SecurityFinding[]): Risk {
  if (findings.some(f => f.severity === "critical")) return "critical";
  if (findings.some(f => f.severity === "high")) return "high";
  if (findings.some(f => f.severity === "medium")) return "medium";
  return "low";
}

function clampSeverity(s: unknown): Severity {
  const allowed: Severity[] = ["critical", "high", "medium", "low", "info"];
  return typeof s === "string" && (allowed as string[]).includes(s) ? (s as Severity) : "medium";
}

function clampRisk(r: unknown): Risk | undefined {
  const allowed: Risk[] = ["low", "medium", "high", "critical"];
  return typeof r === "string" && (allowed as string[]).includes(r) ? (r as Risk) : undefined;
}

function severityRank(s: Severity): number {
  const rank: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return rank[s] ?? 0;
}

function bySeverityDesc(a: Issue, b: Issue): number {
  return severityRank(a.severity) - severityRank(b.severity);
}

/* ────────────── CWE inference ────────────── */

function inferCWE(i: Issue): string | undefined {
  // Map our internal categories to common CWE identifiers.
  const cat = i.category?.toLowerCase() ?? "";
  if (cat === "secrets" || cat.includes("secret") || cat.includes("credential")) return "CWE-798";
  if (cat === "jwt") return "CWE-326";
  if (cat === "hashing") return "CWE-327";
  if (cat === "sqli") return "CWE-89";
  if (cat === "cmdi") return "CWE-78";
  if (cat === "traversal") return "CWE-22";
  if (cat === "ssrf") return "CWE-918";
  if (cat === "xss") return "CWE-79";
  if (cat === "eval") return "CWE-95";
  if (cat === "redirect") return "CWE-601";
  if (cat === "cors") return "CWE-942";
  return undefined;
}

/* ────────────── Rendering ────────────── */

function renderSecurityReport(report: SecurityReport): string {
  const lines: string[] = [];
  lines.push("# Security Audit Report");
  lines.push("");
  lines.push(`**Overall risk:** ${report.overallRisk}`);
  lines.push(`**Findings:** ${report.findings.length}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push("| Severity | Issue | File | Line | CWE | Recommendation |");
    lines.push("|---|---|---|---|---|---|");
    for (const f of report.findings.slice(0, 50)) {
      const issue = f.issue.replace(/\|/g, "\\|").replace(/\n+/g, " ");
      const rec = f.recommendation.replace(/\|/g, "\\|").replace(/\n+/g, " ");
      lines.push(`| ${f.severity} | ${issue} | ${f.file} | ${f.line} | ${f.cwe ?? "—"} | ${rec} |`);
    }
    lines.push("");
  } else {
    lines.push("_No security findings._");
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

export const securityAgent = new SecurityAgent();
