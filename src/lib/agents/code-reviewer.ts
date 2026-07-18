// CodeInsight AI — Code Reviewer Agent (Prompt 8)
// Senior-engineer-grade code review. Falls back to rule-based heuristics when no AI provider.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";

/* ────────────── Input shapes ────────────── */

interface ReviewFile {
  path: string;
  content: string;
}

interface ReviewInput {
  files?: ReviewFile[];
  diff?: string;
  provider?: AIProviderConfig;
  repositoryUrl?: string;
}

/* ────────────── Review result shapes ────────────── */

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Category =
  | "readability"
  | "architecture"
  | "naming"
  | "performance"
  | "security"
  | "maintainability"
  | "correctness"
  | "style";

interface ReviewIssue {
  file: string;
  line: number;
  severity: Severity;
  category: Category;
  comment: string;
}

interface CodeReview {
  score: number; // 0-100
  summary: string;
  issues: ReviewIssue[];
  suggestions: string[];
}

/* ────────────── Agent ────────────── */

export class CodeReviewerAgent extends BaseAgent {
  readonly id: AgentId = "code-reviewer";
  readonly info: AgentInfo = {
    id: "code-reviewer",
    name: "Code Reviewer",
    description:
      "Performs senior-engineer code reviews — readability, architecture, naming, performance, security, and maintainability.",
    capabilities: [
      { kind: "review", description: "Review code files or a diff and produce a structured report with score, issues, and suggestions." },
    ],
    icon: "Eye",
    color: "#fbbf24",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as ReviewInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const files = input.files ?? [];
    const diff = input.diff ?? "";

    onProgress(10, "Gathering files and diff");

    // Normalize file inputs (skip huge vendored files).
    const reviewable = files.filter(f => f && typeof f.path === "string" && typeof f.content === "string")
      .slice(0, 25); // cap to keep prompts small
    const totalLines = reviewable.reduce((n, f) => n + f.content.split("\n").length, 0);

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(30, "Building review prompt");

    let review: CodeReview;
    if (provider && (reviewable.length > 0 || diff)) {
      review = await this.reviewWithAI(provider, reviewable, diff, signal, onProgress);
    } else {
      review = this.ruleBasedReview(reviewable, diff);
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(90, "Recording decision in shared context");
    this.recordDecision(
      task.id,
      `Code review completed — score ${review.score}/100, ${review.issues.length} issues`,
      review.summary,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(repoUrl, `review:${task.id}`, review, "decision");
      } catch {
        // best-effort; ignore memory write errors
      }
    }

    onProgress(100, "Review complete");
    this.log("info", `Reviewed ${reviewable.length} file(s): score ${review.score}/100, ${review.issues.length} issues`);

    const reportMarkdown = renderReviewReport(review, reviewable.length, totalLines);

    return {
      success: true,
      data: review,
      summary: `Reviewed ${reviewable.length} files: score ${review.score}/100`,
      artifacts: [
        {
          kind: "report",
          path: "code-review.md",
          content: reportMarkdown,
          language: "markdown",
          meta: { score: review.score, issueCount: review.issues.length },
        },
      ],
      metrics: { score: review.score, issues: review.issues.length, files: reviewable.length, lines: totalLines },
    };
  }

  /* ────── AI path ────── */

  private async reviewWithAI(
    provider: AIProviderConfig,
    files: ReviewFile[],
    diff: string,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<CodeReview> {
    const fileBlocks = files
      .map(f => `### FILE: ${f.path}\n\`\`\`\n${truncate(f.content, 6000)}\n\`\`\``)
      .join("\n\n");
    const diffBlock = diff ? `### DIFF\n\`\`\`diff\n${truncate(diff, 6000)}\n\`\`\`` : "";

    const system: AIMessage = {
      role: "system",
      content:
        "You are a Staff-level code reviewer with 15+ years of experience. " +
        "Review code like a senior engineer would: check readability, architecture, naming, " +
        "performance, security, and maintainability. Be specific and constructive. " +
        "Always return STRICT JSON only — no prose outside the JSON.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        "Review the following code. Return JSON in EXACTLY this shape:\n" +
        "```json\n" +
        "{\n" +
        '  "score": <number 0-100>,\n' +
        '  "summary": "<1-2 sentence overall assessment>",\n' +
        '  "issues": [\n' +
        '    { "file": "<path>", "line": <number>, "severity": "critical|high|medium|low|info", "category": "readability|architecture|naming|performance|security|maintainability|correctness|style", "comment": "<specific, actionable feedback>" }\n' +
        "  ],\n" +
        '  "suggestions": ["<improvement suggestion>", "..."]\n' +
        "}\n" +
        "```\n\n" +
        `${fileBlocks}\n\n${diffBlock}`.trim(),
    };

    onProgress(60, "Calling AI for structured review");
    try {
      const result = await callAIForJSON<Partial<CodeReview>>(provider, [system, user], {
        temperature: 0.2,
        maxTokens: 4096,
        signal,
      });
      return normalizeReview(result, files);
    } catch (err) {
      this.log("warn", `AI review failed, falling back to rule-based: ${(err as Error).message}`);
      return this.ruleBasedReview(files, diff);
    }
  }

  /* ────── Rule-based fallback ────── */

  private ruleBasedReview(files: ReviewFile[], diff: string): CodeReview {
    const issues: ReviewIssue[] = [];
    const suggestions: string[] = [];

    for (const f of files) {
      const lines = f.content.split("\n");
      const len = lines.length;

      // Heuristic 1: long file
      if (len > 400) {
        issues.push({
          file: f.path,
          line: 1,
          severity: "medium",
          category: "maintainability",
          comment: `File is ${len} lines long — consider splitting into smaller modules.`,
        });
      }

      // Heuristic 2: high complexity (rough proxy: nested control flow depth)
      let maxDepth = 0;
      let curDepth = 0;
      for (const ln of lines) {
        const indent = (ln.match(/^\s*/)?.[0].length ?? 0) / 2;
        if (/(if|for|while|switch|case|function|=>|class)\b/.test(ln)) {
          curDepth = Math.max(curDepth, indent);
          if (curDepth > maxDepth) maxDepth = curDepth;
        }
      }
      if (maxDepth > 5) {
        issues.push({
          file: f.path,
          line: 1,
          severity: "medium",
          category: "maintainability",
          comment: `Maximum nesting depth ~${maxDepth} — extract deeply-nested logic into named helpers.`,
        });
      }

      // Heuristic 3: console.log / debugger in production source
      lines.forEach((ln, i) => {
        if (/\bconsole\.log\b/.test(ln)) {
          issues.push({
            file: f.path,
            line: i + 1,
            severity: "low",
            category: "style",
            comment: "console.log left in source — remove or replace with a logger.",
          });
        }
        if (/\bdebugger\b/.test(ln)) {
          issues.push({
            file: f.path,
            line: i + 1,
            severity: "high",
            category: "correctness",
            comment: "debugger statement left in source — remove before shipping.",
          });
        }
      });

      // Heuristic 4: TODO/FIXME/HACK/XXX
      lines.forEach((ln, i) => {
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(ln)) {
          issues.push({
            file: f.path,
            line: i + 1,
            severity: "info",
            category: "maintainability",
            comment: `${RegExp.lastMatch} comment found — track and resolve.`,
          });
        }
      });

      // Heuristic 5: any/unknown
      const anyCount = (f.content.match(/:\s*any\b/g) ?? []).length;
      if (anyCount > 3) {
        issues.push({
          file: f.path,
          line: 1,
          severity: "low",
          category: "maintainability",
          comment: `${anyCount} occurrences of ': any' — prefer specific types or 'unknown'.`,
        });
      }
    }

    if (diff) {
      const added = (diff.match(/^\+\s*[^+]/gm) ?? []).length;
      const removed = (diff.match(/^-\s*[^-]/gm) ?? []).length;
      suggestions.push(`Diff contains +${added}/-${removed} lines. Verify tests cover the new behavior.`);
    }

    if (issues.length === 0) {
      suggestions.push("No obvious rule-based issues detected. Consider an AI-powered review for deeper analysis.");
    } else {
      suggestions.push("Address critical and high severity issues first.");
      suggestions.push("Add or update unit tests covering the changed code paths.");
    }

    // Score: start at 100, subtract based on severities.
    const weights: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2, info: 1 };
    const penalty = issues.reduce((s, i) => s + (weights[i.severity] ?? 0), 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));

    return {
      score,
      summary:
        files.length === 0 && !diff
          ? "No files or diff provided for review."
          : `Rule-based review of ${files.length} file(s): ${issues.length} issue(s) detected, score ${score}/100.`,
      issues,
      suggestions,
    };
  }
}

/* ────────────── Helpers ────────────── */

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… [truncated]";
}

function normalizeReview(raw: Partial<CodeReview>, files: ReviewFile[]): CodeReview {
  const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : 0;
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "AI review completed.";
  const rawIssues = Array.isArray(raw.issues) ? raw.issues : [];
  const issues: ReviewIssue[] = rawIssues
    .filter(i => i && typeof i === "object")
    .map(i => ({
      file: typeof i.file === "string" ? i.file : files[0]?.path ?? "unknown",
      line: typeof i.line === "number" && i.line > 0 ? Math.floor(i.line) : 1,
      severity: clampSeverity(i.severity),
      category: clampCategory(i.category),
      comment: typeof i.comment === "string" && i.comment.trim() ? i.comment.trim() : "No comment.",
    }));
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map(s => s.trim())
    : [];
  return { score, summary, issues, suggestions };
}

function clampSeverity(s: unknown): Severity {
  const allowed: Severity[] = ["critical", "high", "medium", "low", "info"];
  return typeof s === "string" && (allowed as string[]).includes(s) ? (s as Severity) : "medium";
}

function clampCategory(c: unknown): Category {
  const allowed: Category[] = [
    "readability",
    "architecture",
    "naming",
    "performance",
    "security",
    "maintainability",
    "correctness",
    "style",
  ];
  return typeof c === "string" && (allowed as string[]).includes(c) ? (c as Category) : "maintainability";
}

function cancelled(agentName: string): TaskResult {
  return {
    success: false,
    data: null,
    summary: `${agentName} cancelled before completion.`,
    artifacts: [],
  };
}

function renderReviewReport(review: CodeReview, fileCount: number, totalLines: number): string {
  const lines: string[] = [];
  lines.push("# Code Review Report");
  lines.push("");
  lines.push(`**Score:** ${review.score}/100`);
  lines.push(`**Files reviewed:** ${fileCount}`);
  lines.push(`**Total lines:** ${totalLines}`);
  lines.push(`**Issues found:** ${review.issues.length}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(review.summary);
  lines.push("");

  if (review.issues.length > 0) {
    lines.push("## Issues");
    lines.push("");
    lines.push("| Severity | Category | File | Line | Comment |");
    lines.push("|---|---|---|---|---|");
    for (const i of review.issues.slice(0, 50)) {
      const comment = i.comment.replace(/\|/g, "\\|").replace(/\n+/g, " ");
      lines.push(`| ${i.severity} | ${i.category} | ${i.file} | ${i.line} | ${comment} |`);
    }
    lines.push("");
  }

  if (review.suggestions.length > 0) {
    lines.push("## Suggestions");
    lines.push("");
    for (const s of review.suggestions) lines.push(`- ${s}`);
    lines.push("");
  }

  return lines.join("\n");
}

export const codeReviewerAgent = new CodeReviewerAgent();
