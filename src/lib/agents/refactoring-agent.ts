// CodeInsight AI — Refactoring Agent (Prompt 3, refactor part)
// Performs goal-driven refactors (extract function, simplify conditional, rename variable, …).
// Asks the AI for a structured refactor result, validates the output, and returns a diff artifact.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";

/* ────────────── Input shapes ────────────── */

interface RefactorInput {
  filePath?: string;
  content?: string;
  goal?: string;
  provider?: AIProviderConfig;
  repositoryUrl?: string;
}

/* ────────────── Output shapes ────────────── */

interface ChangeDescription {
  description: string;
  linesChanged: number;
}

interface RefactorResult {
  refactoredContent: string;
  changes: ChangeDescription[];
  rationale: string;
}

/* ────────────── Agent ────────────── */

export class RefactoringAgent extends BaseAgent {
  readonly id: AgentId = "refactoring-agent";
  readonly info: AgentInfo = {
    id: "refactoring-agent",
    name: "Refactoring Agent",
    description:
      "Goal-driven refactoring: extract functions, simplify conditionals, rename variables, reduce duplication — preserving behavior.",
    capabilities: [
      { kind: "refactor", description: "Refactor a source file toward a stated goal and return the new content + a diff." },
    ],
    icon: "Wrench",
    color: "#60a5fa",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as RefactorInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const filePath = input.filePath ?? "source.ts";
    const originalContent = input.content ?? "";
    const goal = (input.goal ?? "general improvement").trim();

    if (!originalContent.trim()) {
      return {
        success: false,
        data: null,
        summary: "Refactoring Agent received empty file content.",
        artifacts: [],
      };
    }

    onProgress(10, "Reading source content");
    if (signal.aborted) return cancelled(this.info.name);

    if (!provider) {
      this.log("warn", "No AI provider supplied — cannot perform AI-driven refactor.");
      return {
        success: false,
        data: null,
        summary: "No AI provider — cannot perform refactor",
        artifacts: [],
      };
    }

    onProgress(30, "Building refactoring prompt");

    const system: AIMessage = {
      role: "system",
      content:
        "You are a meticulous refactoring engineer. Apply the requested refactor while PRESERVING behavior — no new bugs, no removed features, no behavioral changes. " +
        "Return the COMPLETE refactored file content. Return STRICT JSON only — no prose outside the JSON.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        `Refactor goal: ${goal}\n\n` +
        "Return JSON in EXACTLY this shape:\n" +
        "```json\n" +
        "{\n" +
        '  "refactoredContent": "<the COMPLETE refactored file content — no truncation, no placeholders>",\n' +
        '  "changes": [\n' +
        '    { "description": "<what was changed>", "linesChanged": <number> }\n' +
        "  ],\n" +
        '  "rationale": "<why this refactor improves the code>"\n' +
        "}\n" +
        "```\n\n" +
        `### FILE: ${filePath}\n\`\`\`\n${truncate(originalContent, 8000)}\n\`\`\``,
    };

    onProgress(60, "Calling AI for refactored content");

    let result: RefactorResult;
    try {
      const raw = await callAIForJSON<Partial<RefactorResult>>(provider, [system, user], {
        temperature: 0.2,
        maxTokens: 8192,
        signal,
      });
      result = normalizeRefactor(raw, originalContent);
    } catch (err) {
      this.log("error", `AI refactor failed: ${(err as Error).message}`);
      return {
        success: false,
        data: null,
        summary: `Refactoring Agent failed: ${(err as Error).message}`,
        artifacts: [],
      };
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(80, "Validating refactored content");
    const validation = validateRefactor(result.refactoredContent, originalContent);
    if (!validation.ok) {
      this.log("warn", `Refactor validation failed: ${validation.reason}`);
      this.recordDecision(task.id, `Refactor of ${filePath} rejected — failed validation`, validation.reason);
      return {
        success: false,
        data: { rationale: result.rationale, changes: result.changes, reason: validation.reason },
        summary: `Refactor of ${filePath} failed validation: ${validation.reason}`,
        artifacts: [],
      };
    }

    this.recordDecision(
      task.id,
      `Refactored ${filePath} — ${result.changes.length} change(s)`,
      result.rationale,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(
          repoUrl,
          `refactor:${task.id}:${filePath}`,
          { goal, changes: result.changes, rationale: result.rationale },
          "decision",
        );
      } catch {
        // best-effort
      }
    }

    onProgress(100, "Refactor complete");
    this.log("info", `Refactored ${filePath} — ${result.changes.length} change(s).`);

    const diff = buildDiff(originalContent, result.refactoredContent, filePath);

    return {
      success: true,
      data: result,
      summary: `Refactored ${filePath}: ${truncateStr(result.rationale, 120)}`,
      artifacts: [
        {
          kind: "file",
          path: filePath,
          content: result.refactoredContent,
          language: detectLanguage(filePath),
          meta: { goal, changes: result.changes.length, rationale: result.rationale },
        },
        {
          kind: "diff",
          path: filePath,
          content: diff,
          language: "diff",
        },
      ],
      metrics: {
        linesBefore: originalContent.split("\n").length,
        linesAfter: result.refactoredContent.split("\n").length,
        changes: result.changes.length,
      },
    };
  }
}

/* ────────────── Helpers ────────────── */

function normalizeRefactor(raw: Partial<RefactorResult>, original: string): RefactorResult {
  const refactoredContent =
    typeof raw.refactoredContent === "string" && raw.refactoredContent.trim() ? raw.refactoredContent : original;
  const changes: ChangeDescription[] = Array.isArray(raw.changes)
    ? raw.changes
        .filter((c): c is ChangeDescription => !!c && typeof c === "object")
        .map(c => ({
          description: typeof c.description === "string" && c.description.trim() ? c.description.trim() : "change",
          linesChanged: typeof c.linesChanged === "number" && c.linesChanged >= 0 ? Math.floor(c.linesChanged) : 0,
        }))
    : [];
  const rationale = typeof raw.rationale === "string" && raw.rationale.trim() ? raw.rationale.trim() : "Refactor applied.";
  return { refactoredContent, changes, rationale };
}

interface ValidationOutcome {
  ok: boolean;
  reason: string;
}

function validateRefactor(refactored: string, original: string): ValidationOutcome {
  if (!refactored.trim()) return { ok: false, reason: "refactored content is empty" };
  const counts = countBraces(refactored);
  if (counts.braces !== 0) return { ok: false, reason: `unbalanced curly braces (delta ${counts.braces})` };
  if (counts.parens !== 0) return { ok: false, reason: `unbalanced parentheses (delta ${counts.parens})` };
  if (counts.brackets !== 0) return { ok: false, reason: `unbalanced square brackets (delta ${counts.brackets})` };
  if (refactored.trim() === original.trim()) {
    return { ok: false, reason: "no changes were made" };
  }
  // Sanity: refactored file shouldn't shrink to less than 50% of the original — usually indicates truncation.
  if (original.length > 200 && refactored.length < original.length * 0.5) {
    return { ok: false, reason: "refactored content is suspiciously shorter than original (likely truncated)" };
  }
  return { ok: true, reason: "ok" };
}

function countBraces(src: string): { braces: number; parens: number; brackets: number } {
  const s = src
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

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "text";
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

function buildDiff(before: string, after: string, path: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let i = 0;
  while (i < beforeLines.length && i < afterLines.length && beforeLines[i] === afterLines[i]) i++;
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
    return `--- a/${path}\n+++ b/${path}\n@@ no changes @@\n`;
  }
  const header = `--- a/${path}\n+++ b/${path}\n@@ -${startLine},${Math.max(removed.length, 1)} +${startLine},${Math.max(added.length, 1)} @@\n`;
  const body: string[] = [];
  for (const ln of removed) body.push(`-${ln}`);
  for (const ln of added) body.push(`+${ln}`);
  return header + body.join("\n") + "\n";
}

export const refactoringAgent = new RefactoringAgent();
