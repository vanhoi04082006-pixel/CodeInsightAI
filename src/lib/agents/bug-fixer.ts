// CodeInsight AI — Bug Fixer Agent (Prompt 7)
// Parses a stack trace or analyzer issues, locates the buggy file, asks AI for a patch,
// validates it (balanced braces), and retries up to 2 times on validation failure.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";
import type { Issue } from "@/lib/types";

/* ────────────── Input shapes ────────────── */

interface SourceFile {
  path: string;
  content: string;
}

interface BugFixerInput {
  stackTrace?: string;
  issues?: Issue[];
  files?: SourceFile[];
  provider?: AIProviderConfig;
  repositoryUrl?: string;
  maxRetries?: number;
}

/* ────────────── Output shapes ────────────── */

interface BugFixProposal {
  rootCause: string;
  fixDescription: string;
  patchedFile: string;
  confidence: number; // 0-1
}

interface StackFrame {
  file: string;
  line: number;
  raw: string;
}

/* ────────────── Agent ────────────── */

export class BugFixerAgent extends BaseAgent {
  readonly id: AgentId = "bug-fixer";
  readonly info: AgentInfo = {
    id: "bug-fixer",
    name: "Bug Fixer",
    description:
      "Diagnoses bugs from stack traces or analyzer issues, proposes an AI-generated patch, validates it, and retries on failure.",
    capabilities: [
      { kind: "fix-bug", description: "Identify root cause and produce a patched file with a unified-diff artifact." },
    ],
    icon: "Bug",
    color: "#f87171",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as BugFixerInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const files = input.files ?? [];
    const maxRetries = typeof input.maxRetries === "number" ? input.maxRetries : 2;

    onProgress(10, "Parsing stack trace / issues to locate root cause");

    const frames = parseStackTrace(input.stackTrace ?? "");
    const issues = Array.isArray(input.issues) ? input.issues : [];
    const targetFile = pickTargetFile(frames, issues, files);

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(30, "Locating buggy file content");

    const buggyFile = files.find(f => f.path === targetFile) ?? files[0];
    if (!buggyFile) {
      return {
        success: false,
        data: null,
        summary: "Bug Fixer could not locate any source file to patch.",
        artifacts: [],
      };
    }

    // No provider → cannot propose AI fix.
    if (!provider) {
      this.log("warn", "No AI provider supplied — cannot propose a fix.");
      return {
        success: false,
        data: null,
        summary: "No AI provider — cannot propose fix",
        artifacts: [],
      };
    }

    if (signal.aborted) return cancelled(this.info.name);

    // Retry loop: attempt → validate → retry with hint on failure.
    let attempt = 0;
    let proposal: BugFixProposal | null = null;
    let lastReason = "";
    const confidenceDecrement = 0.15;

    while (attempt <= maxRetries && !signal.aborted) {
      onProgress(progressForAttempt(attempt, maxRetries), `AI fix attempt ${attempt + 1}/${maxRetries + 1}`);
      try {
        proposal = await this.proposeFix(
          provider,
          buggyFile,
          input.stackTrace ?? "",
          issues,
          frames,
          lastReason,
          signal,
        );
      } catch (err) {
        lastReason = `AI call failed: ${(err as Error).message}`;
        this.log("warn", `Attempt ${attempt + 1} failed — ${lastReason}`);
        attempt++;
        continue;
      }

      if (signal.aborted) return cancelled(this.info.name);

      const validation = validatePatch(proposal.patchedFile, buggyFile.path);
      if (validation.ok) {
        onProgress(90, "Patch validated");
        break;
      }
      lastReason = validation.reason;
      proposal.confidence = Math.max(0, (proposal.confidence ?? 0.5) - confidenceDecrement);
      this.log("warn", `Attempt ${attempt + 1} patch invalid — ${lastReason}`);
      attempt++;
    }

    if (signal.aborted) return cancelled(this.info.name);

    if (!proposal) {
      return {
        success: false,
        data: { rootCause: lastReason || "AI did not return a valid proposal." },
        summary: `Bug Fixer failed after ${attempt} attempt(s): ${lastReason || "no proposal"}`,
        artifacts: [],
      };
    }

    // Re-validate final proposal — if it still fails, return success:false with the best effort.
    const finalCheck = validatePatch(proposal.patchedFile, buggyFile.path);
    if (!finalCheck.ok) {
      this.recordDecision(
        task.id,
        `Bug fix proposal for ${buggyFile.path} failed validation after retries`,
        finalCheck.reason,
      );
      return {
        success: false,
        data: { rootCause: proposal.rootCause, reason: finalCheck.reason, proposal },
        summary: `Could not produce a valid patch for ${buggyFile.path}: ${finalCheck.reason}`,
        artifacts: [],
      };
    }

    onProgress(100, "Patch ready");
    this.recordDecision(
      task.id,
      `Proposed bug fix for ${buggyFile.path} (confidence ${(proposal.confidence * 100).toFixed(0)}%)`,
      proposal.fixDescription,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(
          repoUrl,
          `bugfix:${task.id}:${buggyFile.path}`,
          { rootCause: proposal.rootCause, fixDescription: proposal.fixDescription, confidence: proposal.confidence },
          "fix",
        );
      } catch {
        // best-effort
      }
    }

    this.log("info", `Bug fix ready for ${buggyFile.path} — confidence ${(proposal.confidence * 100).toFixed(0)}%`);

    const diffArtifact = buildDiffArtifact(buggyFile, proposal);

    return {
      success: true,
      data: proposal,
      summary: `Proposed fix for ${buggyFile.path}: ${truncateStr(proposal.fixDescription, 120)}`,
      artifacts: [diffArtifact],
      metrics: {
        confidence: Math.round(proposal.confidence * 100),
        attempts: attempt + 1,
      },
    };
  }

  /* ────── AI call ────── */

  private async proposeFix(
    provider: AIProviderConfig,
    buggyFile: SourceFile,
    stackTrace: string,
    issues: Issue[],
    frames: StackFrame[],
    previousFailureHint: string,
    signal: AbortSignal,
  ): Promise<BugFixProposal> {
    const issueBlock = issues
      .slice(0, 10)
      .map(i => `- [${i.severity}] ${i.title} @ ${i.file}:${i.line ?? "?"} — ${i.description}`)
      .join("\n");
    const frameBlock = frames
      .slice(0, 8)
      .map(f => `  at ${f.raw} (${f.file}:${f.line})`)
      .join("\n");

    const retryHint = previousFailureHint
      ? `\n\nA PREVIOUS attempt at this fix FAILED validation because: ${previousFailureHint}\nPlease correct this and try again.`
      : "";

    const system: AIMessage = {
      role: "system",
      content:
        "You are a senior debugging engineer. Diagnose the root cause, propose a minimal fix, and return the COMPLETE patched file content. " +
        "Return STRICT JSON only — no prose outside the JSON.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        "Diagnose and fix the bug described below. Return JSON in EXACTLY this shape:\n" +
        "```json\n" +
        "{\n" +
        '  "rootCause": "<short explanation of the root cause>",\n' +
        '  "fixDescription": "<what the fix does, 1-3 sentences>",\n' +
        '  "patchedFile": "<the COMPLETE new content of the file, with the fix applied — do not truncate or use placeholders>",\n' +
        '  "confidence": <number 0-1>\n' +
        "}\n" +
        "```\n\n" +
        `### STACK TRACE\n${stackTrace || "(none provided)"}\n\n` +
        `### FRAMES\n${frameBlock || "(none parsed)"}\n\n` +
        `### ANALYZER ISSUES\n${issueBlock || "(none)"}\n\n` +
        `### BUGGY FILE: ${buggyFile.path}\n\`\`\`\n${truncate(buggyFile.content, 8000)}\n\`\`\`${retryHint}`.trim(),
    };

    const raw = await callAIForJSON<Partial<BugFixProposal>>(provider, [system, user], {
      temperature: 0.15,
      maxTokens: 8192,
      signal,
    });

    return {
      rootCause: typeof raw.rootCause === "string" && raw.rootCause.trim() ? raw.rootCause.trim() : "Root cause not identified.",
      fixDescription:
        typeof raw.fixDescription === "string" && raw.fixDescription.trim() ? raw.fixDescription.trim() : "No description provided.",
      patchedFile: typeof raw.patchedFile === "string" && raw.patchedFile.trim() ? raw.patchedFile : buggyFile.content,
      confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
    };
  }
}

/* ────────────── Stack-trace parsing ────────────── */

function parseStackTrace(stack: string): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  // matches: at foo (file.ts:12:34)   OR   at file.ts:12:34   OR   file.ts:12:34
  const re = /(?:at\s+)?([^\s()]+)?\s*\(?([^()\s]+?):(\d+)(?::\d+)?\)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stack)) !== null) {
    const file = m[2];
    const line = parseInt(m[3], 10);
    if (!file || isNaN(line)) continue;
    // Skip node:internal / node_modules noise — keep for now, filtering happens in pickTargetFile.
    frames.push({ file, line, raw: m[0] });
  }
  return frames;
}

function pickTargetFile(frames: StackFrame[], issues: Issue[], files: SourceFile[]): string | undefined {
  // Prefer the first frame whose file is in our supplied file set.
  const knownPaths = new Set(files.map(f => f.path));
  for (const f of frames) {
    if (knownPaths.has(f.file)) return f.file;
    // also try basename match
    const base = f.file.split("/").pop() ?? f.file;
    const match = files.find(fw => fw.path.endsWith(base));
    if (match) return match.path;
  }
  // Fall back to highest-severity issue file.
  if (issues.length > 0) {
    const sorted = [...issues].sort(bySeverityDesc);
    const top = sorted[0];
    if (top && knownPaths.has(top.file)) return top.file;
    if (top) {
      const match = files.find(fw => fw.path.endsWith(top.file.split("/").pop() ?? top.file));
      if (match) return match.path;
    }
  }
  return files[0]?.path;
}

function bySeverityDesc(a: Issue, b: Issue): number {
  const rank: Record<Issue["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
}

/* ────────────── Patch validation ────────────── */

interface ValidationOutcome {
  ok: boolean;
  reason: string;
}

function validatePatch(patched: string, fileName: string): ValidationOutcome {
  if (!patched || !patched.trim()) {
    return { ok: false, reason: "patched file content is empty" };
  }
  // Basic balanced-brace check (skip template literals / strings heuristically — not a real parser).
  const counts = countBraces(patched);
  if (counts.braces !== 0) {
    return { ok: false, reason: `unbalanced curly braces (delta ${counts.braces})` };
  }
  if (counts.parens !== 0) {
    return { ok: false, reason: `unbalanced parentheses (delta ${counts.parens})` };
  }
  if (counts.brackets !== 0) {
    return { ok: false, reason: `unbalanced square brackets (delta ${counts.brackets})` };
  }
  // Must be at least roughly the same scale as a real source file.
  const lines = patched.split("\n").length;
  if (lines < 1) {
    return { ok: false, reason: `patched ${fileName} has too few lines (${lines})` };
  }
  return { ok: true, reason: "ok" };
}

function countBraces(src: string): { braces: number; parens: number; brackets: number } {
  // Strip line and block comments and string/template literals to avoid false positives.
  let s = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
  const braces = (s.match(/{/g) ?? []).length - (s.match(/}/g) ?? []).length;
  const parens = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
  const brackets = (s.match(/\[/g) ?? []).length - (s.match(/\]/g) ?? []).length;
  return { braces, parens, brackets };
}

/* ────────────── Helpers ────────────── */

function progressForAttempt(attempt: number, maxRetries: number): number {
  // attempt 0 → 50; attempt maxRetries → 88
  if (maxRetries <= 0) return 50;
  return 50 + Math.round((attempt / maxRetries) * 38);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… [truncated]";
}

function truncateStr(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "…";
}

function cancelled(agentName: string): TaskResult {
  return {
    success: false,
    data: null,
    summary: `${agentName} cancelled before completion.`,
    artifacts: [],
  };
}

function buildDiffArtifact(original: SourceFile, proposal: BugFixProposal): import("./types").TaskArtifact {
  const diff = computeSimpleDiff(original.content, proposal.patchedFile, original.path);
  return {
    kind: "diff",
    path: original.path,
    content: diff,
    language: "diff",
    meta: {
      rootCause: proposal.rootCause,
      fixDescription: proposal.fixDescription,
      confidence: proposal.confidence,
    },
  };
}

/**
 * Minimal unified-diff generator: line-level, no LCS optimization.
 * Good enough for short artifact previews; not a replacement for a real diff lib.
 */
function computeSimpleDiff(before: string, after: string, path: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const header = `--- a/${path}\n+++ b/${path}\n`;
  const body: string[] = [];

  // Common prefix
  let i = 0;
  while (i < beforeLines.length && i < afterLines.length && beforeLines[i] === afterLines[i]) i++;
  // Common suffix
  let j = 0;
  while (
    j < beforeLines.length - i &&
    j < afterLines.length - i &&
    beforeLines[beforeLines.length - 1 - j] === afterLines[afterLines.length - 1 - j]
  ) {
    j++;
  }

  const startLine = i + 1;
  const removed = beforeLines.slice(i, beforeLines.length - j);
  const added = afterLines.slice(i, afterLines.length - j);

  if (removed.length === 0 && added.length === 0) {
    return header + "@@ no changes @@\n";
  }

  body.push(`@@ -${startLine},${Math.max(removed.length, 1)} +${startLine},${Math.max(added.length, 1)} @@`);
  for (const ln of removed) body.push(`-${ln}`);
  for (const ln of added) body.push(`+${ln}`);

  return header + body.join("\n") + "\n";
}

export const bugFixerAgent = new BugFixerAgent();
