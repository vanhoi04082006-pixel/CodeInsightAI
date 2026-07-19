// CodeInsight AI — Tool Selector
// Phase D: Smart tool ranking + composition suggestion + approval gating +
// argument validation. Used by the ReAct loop's THINK phase to surface only
// the most relevant tools to the AI (cutting context bloat) and by the ACT
// phase to enforce permission rules + cache-friendly argument shapes.
//
// Design:
//   - Rule-based ranking (no AI calls) — fast and deterministic.
//   - Each tool starts with a baseline relevance score, then receives boosts
//     based on goal keywords, error-context patterns, mission state, and
//     recent-action repetition. Scores are clamped to [0, 1].
//   - `formatRankedToolsForAI()` returns a prompt fragment listing only the
//     top-N tools (default 5) — the AI still picks which to invoke.
//   - `requiresApproval()` flags destructive operations (rm, force-push,
//     out-of-cwd writes) so the loop can prompt the user / log a warning.
//   - `validateArgs()` does a lightweight schema check against the tool
//     definition so the AI's malformed calls are caught before execution.

import * as path from "path";
import { TOOL_CATALOG } from "./tool-registry";
import type { ToolDefinition } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export interface ToolRanking {
  tool: string;
  /** 0-1 relevance score (higher = more relevant). */
  relevanceScore: number;
  /** Human-readable reason for the score (shown to the AI). */
  reason: string;
}

export interface ToolSelectionContext {
  goal: string;
  currentPhase: string;
  recentActions: string[];
  knownIssues: string[];
  filesModified: string[];
  memorySummary: string;
  errorContext?: string;
}

export interface ToolComposition {
  tools: string[];
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Module constants ────────────────────────────────────────────────────────
const DEFAULT_LIMIT = 5;
const BASELINE_SCORE = 0.3;
const MAX_SCORE = 1;
const MIN_SCORE = 0;

// Build a quick lookup of tool definitions by name. The catalog is small
// (10 entries) so a plain object is fine — no need for a Map.
const TOOL_BY_NAME: Record<string, ToolDefinition> = TOOL_CATALOG.reduce(
  (acc, t) => {
    acc[t.name] = t;
    return acc;
  },
  {} as Record<string, ToolDefinition>,
);

// ── Internal: keyword → boost map ───────────────────────────────────────────
// Each entry maps a goal-keyword regex to a set of (tool → boost, reason).
interface BoostRule {
  pattern: RegExp;
  boosts: Array<{ tool: string; amount: number; reason: string }>;
}

const GOAL_BOOSTS: BoostRule[] = [
  {
    pattern: /\btest(s|ing|ed)?\b/i,
    boosts: [
      { tool: "run_command", amount: 0.55, reason: "run test suite via shell" },
      { tool: "read_file", amount: 0.3, reason: "inspect test specs" },
    ],
  },
  {
    pattern: /\b(fix|bug|defect|issue|broken|error|crash)\b/i,
    boosts: [
      { tool: "search_code", amount: 0.5, reason: "locate bug origin" },
      { tool: "read_file", amount: 0.4, reason: "read affected source" },
      { tool: "analyze_ast", amount: 0.4, reason: "trace imports / call graph" },
      { tool: "edit_file", amount: 0.3, reason: "apply the fix" },
    ],
  },
  {
    pattern: /\b(refactor|restructure|clean ?up|simplify|extract)\b/i,
    boosts: [
      { tool: "analyze_ast", amount: 0.55, reason: "map structure before edits" },
      { tool: "read_file", amount: 0.4, reason: "read current implementation" },
      { tool: "edit_file", amount: 0.45, reason: "apply refactor" },
    ],
  },
  {
    pattern: /\b(deploy|ship|release|publish)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.55, reason: "build + deploy" },
      { tool: "git_status", amount: 0.4, reason: "verify clean tree" },
      { tool: "git_diff", amount: 0.3, reason: "review final changes" },
    ],
  },
  {
    pattern: /\b(search|find|grep|locate)\b/i,
    boosts: [
      { tool: "search_code", amount: 0.6, reason: "ripgrep across repo" },
      { tool: "list_files", amount: 0.3, reason: "enumerate candidates" },
    ],
  },
  {
    pattern: /\b(read|inspect|view|examine|understand)\b/i,
    boosts: [
      { tool: "read_file", amount: 0.55, reason: "read target file" },
      { tool: "analyze_ast", amount: 0.3, reason: "structural overview" },
    ],
  },
  {
    pattern: /\b(list|explore|browse|navigate)\b/i,
    boosts: [
      { tool: "list_files", amount: 0.6, reason: "enumerate repository" },
      { tool: "git_status", amount: 0.2, reason: "current change set" },
    ],
  },
  {
    pattern: /\b(edit|write|create|modify|update|patch|implement|add)\b/i,
    boosts: [
      { tool: "edit_file", amount: 0.55, reason: "write target file" },
      { tool: "read_file", amount: 0.3, reason: "read existing content first" },
    ],
  },
  {
    pattern: /\b(build|compile|tsc|webpack|bundle)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.6, reason: "run build pipeline" },
    ],
  },
  {
    pattern: /\b(lint|eslint|prettier|format)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.55, reason: "run linter / formatter" },
      { tool: "edit_file", amount: 0.3, reason: "apply lint fixes" },
    ],
  },
  {
    pattern: /\b(commit|push|pr|pull request|merge)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.5, reason: "git commit / push" },
      { tool: "git_status", amount: 0.4, reason: "review staged files" },
      { tool: "git_diff", amount: 0.35, reason: "review changes" },
    ],
  },
  {
    pattern: /\b(diff|change|review|status)\b/i,
    boosts: [
      { tool: "git_diff", amount: 0.55, reason: "show working-tree diff" },
      { tool: "git_status", amount: 0.5, reason: "git status summary" },
    ],
  },
  {
    pattern: /\b(delegate|invoke|specialist|agent)\b/i,
    boosts: [
      { tool: "invoke_agent", amount: 0.6, reason: "delegate to specialist agent" },
    ],
  },
  {
    pattern: /\b(docs?|documentation|readme)\b/i,
    boosts: [
      { tool: "read_file", amount: 0.4, reason: "read existing docs" },
      { tool: "edit_file", amount: 0.5, reason: "write/update docs" },
    ],
  },
  {
    pattern: /\b(web|online|search the internet|google)\b/i,
    boosts: [
      { tool: "web_search", amount: 0.6, reason: "lookup external info" },
    ],
  },
  {
    pattern: /\b(security|vulnerability|cve|injection|xss)\b/i,
    boosts: [
      { tool: "search_code", amount: 0.45, reason: "find risky patterns" },
      { tool: "analyze_ast", amount: 0.35, reason: "trace data flow" },
      { tool: "invoke_agent", amount: 0.4, reason: "delegate to security-agent" },
    ],
  },
  {
    pattern: /\b(performance|optimize|slow|latency|memory leak|cpu)\b/i,
    boosts: [
      { tool: "analyze_ast", amount: 0.4, reason: "find hot paths" },
      { tool: "run_command", amount: 0.4, reason: "run profiler / benchmark" },
      { tool: "invoke_agent", amount: 0.4, reason: "delegate to performance-agent" },
    ],
  },
];

const ERROR_BOOSTS: BoostRule[] = [
  {
    pattern: /\b(module|cannot find module|unresolved|dependency|npm install|missing dependency)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.55, reason: "install missing module" },
      { tool: "search_code", amount: 0.25, reason: "find the import site" },
    ],
  },
  {
    pattern: /\b(type|typescript|ts\d+|argument|incompatible|assignable)\b/i,
    boosts: [
      { tool: "read_file", amount: 0.45, reason: "inspect type signature" },
      { tool: "analyze_ast", amount: 0.45, reason: "trace types across files" },
    ],
  },
  {
    pattern: /\b(syntax|unexpected token|parse error|semicolon|brace)\b/i,
    boosts: [
      { tool: "read_file", amount: 0.5, reason: "view malformed source" },
      { tool: "analyze_ast", amount: 0.4, reason: "structural inspection" },
    ],
  },
  {
    pattern: /\b(permission|eacces|denied|forbidden|chmod)\b/i,
    boosts: [
      { tool: "run_command", amount: 0.4, reason: "adjust permissions" },
    ],
  },
  {
    pattern: /\b(import|export|undefined is not|is not a function|reference)\b/i,
    boosts: [
      { tool: "analyze_ast", amount: 0.55, reason: "map imports / exports" },
      { tool: "search_code", amount: 0.35, reason: "find symbol definition" },
    ],
  },
];

// ── Helper: count occurrences of a tool name in recentActions ───────────────
function countRecent(recentActions: string[], tool: string): number {
  let n = 0;
  for (const a of recentActions) {
    if (a === tool) n++;
  }
  return n;
}

// ── Helper: clamp score ─────────────────────────────────────────────────────
function clamp(n: number): number {
  if (!Number.isFinite(n)) return MIN_SCORE;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, n));
}

// ── Helper: check if a path is outside cwd ──────────────────────────────────
function isPathOutsideCwd(filePath: string, cwd: string): boolean {
  if (!filePath) return false;
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const normalizedCwd = path.resolve(cwd);
  // Outside if the resolved path does not start with cwd + path.sep.
  const rel = path.relative(normalizedCwd, resolved);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

// ── Helper: check if a command string contains destructive tokens ───────────
const DESTRUCTIVE_CMD_PATTERNS: RegExp[] = [
  /\brm\b/,
  /\brmdir\b/,
  /\bunlink\b/,
  /\bdel\b/,
  /\bdelete\b/,
  /\bdrop\b/i, // SQL DROP or generic "drop"
  /\bformat\b/i,
  /\bmkfs\b/,
  /\bdd\b/,
  /\btruncate\b/,
  /\bshred\b/,
  /\bgit\s+push\s+(?:-f|--force)/,
  /\bgit\s+push\s+--force-with-lease/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-zA-Z]*[fdxX]/,
  /\b>\s*\/dev\/(sda|nvme)/, // disk wipe
];

function isDestructiveCommand(command: string): boolean {
  if (!command) return false;
  return DESTRUCTIVE_CMD_PATTERNS.some((re) => re.test(command));
}

// ── Helper: extract file paths referenced in tool args ──────────────────────
function extractFilePaths(tool: string, args: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const pushIfString = (v: unknown) => {
    if (typeof v === "string" && v.length > 0) paths.push(v);
  };
  if (tool === "read_file" || tool === "analyze_ast" || tool === "edit_file") {
    pushIfString(args.path);
  }
  if (tool === "git_diff") {
    pushIfString(args.path);
  }
  if (tool === "list_files") {
    pushIfString(args.dir);
  }
  return paths;
}

// ── Main selector class ─────────────────────────────────────────────────────
export class ToolSelector {
  /**
   * Rank all available tools by relevance to the current context.
   * Returns top N (default 5) tools with relevance scores + reasons.
   */
  rankTools(context: ToolSelectionContext, limit: number = DEFAULT_LIMIT): ToolRanking[] {
    // Start every tool at the baseline.
    const scores = new Map<string, { score: number; reasons: string[] }>();
    for (const t of TOOL_CATALOG) {
      scores.set(t.name, { score: BASELINE_SCORE, reasons: ["baseline"] });
    }

    const applyBoost = (tool: string, amount: number, reason: string) => {
      const entry = scores.get(tool);
      if (!entry) return;
      entry.score += amount;
      if (amount > 0.05) entry.reasons.push(`${reason} (+${amount.toFixed(2)})`);
    };

    // ── Goal-keyword boosts ────────────────────────────────────────────────
    for (const rule of GOAL_BOOSTS) {
      if (rule.pattern.test(context.goal)) {
        for (const b of rule.boosts) applyBoost(b.tool, b.amount, b.reason);
      }
    }

    // ── Error-context boosts ───────────────────────────────────────────────
    const errCtx = context.errorContext ?? "";
    if (errCtx) {
      for (const rule of ERROR_BOOSTS) {
        if (rule.pattern.test(errCtx)) {
          for (const b of rule.boosts) applyBoost(b.tool, b.amount, b.reason);
        }
      }
    }

    // ── State-based boosts ─────────────────────────────────────────────────
    // If no files have been modified yet, prioritize exploration tools.
    if (context.filesModified.length === 0) {
      applyBoost("list_files", 0.5, "exploration: no files modified yet");
      applyBoost("search_code", 0.35, "exploration: locate relevant code");
      applyBoost("git_status", 0.2, "exploration: see working tree");
    }

    // If there are known issues, slightly prioritize search + read.
    if (context.knownIssues.length > 0) {
      applyBoost("search_code", 0.1, "follow up on known issues");
      applyBoost("read_file", 0.1, "follow up on known issues");
    }

    // ── Demote tools that were used heavily in recent iterations ───────────
    // This prevents the loop from getting stuck re-reading the same files.
    for (const t of TOOL_CATALOG) {
      const recentCount = countRecent(context.recentActions, t.name);
      if (recentCount >= 2) {
        const demote = Math.min(0.35, recentCount * 0.12);
        const entry = scores.get(t.name);
        if (entry) {
          entry.score -= demote;
          entry.reasons.push(`recently used ${recentCount}x (-${demote.toFixed(2)})`);
        }
      }
    }

    // Special-case: read_file heavy demotion if used 3+ times recently.
    const readCount = countRecent(context.recentActions, "read_file");
    if (readCount >= 3) {
      const entry = scores.get("read_file");
      if (entry) {
        entry.score -= 0.2;
        entry.reasons.push("over-explored (-0.20)");
      }
    }

    // ── Phase-aware boosts ─────────────────────────────────────────────────
    if (context.currentPhase === "observe" || context.currentPhase === "think") {
      applyBoost("list_files", 0.1, "observation phase");
      applyBoost("git_status", 0.1, "observation phase");
    }

    // ── Build the final sorted ranking ─────────────────────────────────────
    const rankings: ToolRanking[] = TOOL_CATALOG.map((t) => {
      const entry = scores.get(t.name)!;
      return {
        tool: t.name,
        relevanceScore: clamp(entry.score),
        reason: entry.reasons.join("; "),
      };
    })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, Math.max(1, limit));

    return rankings;
  }

  /**
   * Format the ranked tools for the AI prompt (top N only).
   * Mirrors the format of `formatToolsForAI()` but only includes the most
   * relevant tools and prepends a relevance hint.
   */
  formatRankedToolsForAI(
    context: ToolSelectionContext,
    limit: number = DEFAULT_LIMIT,
  ): string {
    const rankings = this.rankTools(context, limit);
    return rankings
      .map((r) => {
        const def = TOOL_BY_NAME[r.tool];
        if (!def) {
          return `### ${r.tool} [relevance ${(r.relevanceScore * 100).toFixed(0)}%]\n${r.reason}`;
        }
        const params = Object.entries(def.parameters)
          .map(([name, schema]) => {
            const req = schema.required ? " (required)" : "";
            return `    - ${name} (${schema.type})${req}: ${schema.description}`;
          })
          .join("\n");
        const relPct = (r.relevanceScore * 100).toFixed(0);
        return `### ${def.name} [${def.category}] (relevance ${relPct}% — ${r.reason})\n${def.description}\nParameters:\n${params || "    (none)"}`;
      })
      .join("\n\n");
  }

  /**
   * Suggest a tool composition (chain) for complex operations.
   * Returns null when no recognized composition matches the goal — the AI
   * should then fall back to the ranked single-tool list.
   */
  suggestComposition(
    goal: string,
    _context: ToolSelectionContext,
  ): ToolComposition | null {
    const g = goal.toLowerCase();

    // Fix / bug → search → read → analyze → edit → verify (run test/lint)
    if (/\b(fix|bug|defect|broken|crash|error)\b/.test(g)) {
      return {
        tools: ["search_code", "read_file", "analyze_ast", "edit_file", "run_command"],
        reason:
          "Locate the bug via search_code, read the affected file, analyze its structure, apply the fix via edit_file, and verify with run_command (tests/lint).",
      };
    }

    // Refactor → read → analyze → edit → run command (lint/test)
    if (/\b(refactor|restructure|clean ?up|simplify|extract)\b/.test(g)) {
      return {
        tools: ["read_file", "analyze_ast", "edit_file", "run_command"],
        reason:
          "Read the current implementation, map its structure via analyze_ast, apply the refactor via edit_file, and verify with run_command (lint/build/test).",
      };
    }

    // Add test → list → read → edit → run tests
    if (/\b(add|write|create)\s+(a\s+)?(test|spec|unit test)\b/.test(g)) {
      return {
        tools: ["list_files", "read_file", "edit_file", "run_command"],
        reason:
          "Locate existing test patterns via list_files, read a sample test, write the new test via edit_file, and run the suite via run_command.",
      };
    }

    // Deploy → status → build/test → deploy
    if (/\b(deploy|ship|release|publish)\b/.test(g)) {
      return {
        tools: ["git_status", "run_command", "git_diff"],
        reason:
          "Confirm a clean working tree via git_status, run the build/test pipeline via run_command, review the final diff via git_diff, then deploy.",
      };
    }

    // Security audit → search → analyze → invoke security-agent
    if (/\b(security|vulnerability|cve|audit)\b/.test(g)) {
      return {
        tools: ["search_code", "analyze_ast", "invoke_agent"],
        reason:
          "Search for risky patterns, analyze data flow, and delegate the deep audit to the security-agent via invoke_agent.",
      };
    }

    // Performance → analyze → run profiler → invoke performance-agent
    if (/\b(performance|optimize|slow|latency)\b/.test(g)) {
      return {
        tools: ["analyze_ast", "run_command", "invoke_agent"],
        reason:
          "Map hot paths via analyze_ast, run a profiler/benchmark via run_command, and delegate the optimization plan to the performance-agent.",
      };
    }

    // Explore / understand → list → read → analyze
    if (/\b(explore|understand|learn|map out|get familiar)\b/.test(g)) {
      return {
        tools: ["list_files", "read_file", "analyze_ast"],
        reason:
          "Enumerate the repository, read key files, and map structure via analyze_ast to build a mental model.",
      };
    }

    return null;
  }

  /**
   * Check if a tool requires approval before execution.
   * Returns true for destructive shell commands, force-pushes, and writes
   * outside the working directory.
   */
  requiresApproval(
    tool: string,
    args: Record<string, unknown>,
    cwd?: string,
  ): boolean {
    if (tool === "run_command") {
      const command =
        typeof args.command === "string" ? args.command : "";
      if (isDestructiveCommand(command)) return true;
      return false;
    }

    if (tool === "edit_file") {
      const filePath = typeof args.path === "string" ? args.path : "";
      if (!filePath) return false;
      // If no cwd is supplied, treat absolute paths as suspicious.
      if (cwd) {
        return isPathOutsideCwd(filePath, cwd);
      }
      return path.isAbsolute(filePath);
    }

    return false;
  }

  /**
   * Validate tool arguments against the tool definition.
   * Checks required params are present and types match. Does NOT enforce
   * semantic correctness — that's the AI's job.
   */
  validateArgs(
    tool: string,
    args: Record<string, unknown>,
  ): ValidationResult {
    const def = TOOL_BY_NAME[tool];
    if (!def) {
      return {
        valid: false,
        errors: [`Unknown tool: ${tool}`],
      };
    }

    const errors: string[] = [];

    for (const [name, schema] of Object.entries(def.parameters)) {
      const value = args[name];
      const isPresent =
        value !== undefined && value !== null && value !== "";

      if (schema.required && !isPresent) {
        errors.push(`Missing required parameter "${name}" (${schema.type})`);
        continue;
      }

      if (!isPresent) continue;

      // Type-check the provided value.
      const typeOk = this.checkType(value, schema.type);
      if (!typeOk) {
        errors.push(
          `Parameter "${name}" must be of type ${schema.type}, got ${typeof value}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Internal: runtime type check ──────────────────────────────────────────
  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "boolean":
        return typeof value === "boolean";
      case "object":
        return (
          typeof value === "object" && value !== null && !Array.isArray(value)
        );
      case "array":
        return Array.isArray(value);
      default:
        // Unknown expected type — accept anything (don't block execution).
        return true;
    }
  }
}

// ── Module singleton ────────────────────────────────────────────────────────
export const toolSelector = new ToolSelector();

// ── Re-export for callers that need to inspect the catalog ──────────────────
export { extractFilePaths as extractToolFilePaths };
