// CodeInsight AI — Reflection Agent
// Phase B: Analyzes each ReAct iteration (success or failure), identifies
// the root cause of any error, proposes a corrective action, and updates
// the mission's confidence + memory accordingly.
//
// Contract:
//   - `reflect()` is called by the ReAct loop after every Act+Verify step.
//   - If an `AIProviderConfig` is supplied, the agent prompts the LLM for a
//     structured `ReflectionResult`.
//   - If no provider is supplied (or the LLM call fails), the agent falls
//     back to a rule-based reflection that pattern-matches common error
//     signatures (missing imports, type errors, syntax errors, etc.).
//   - The agent never throws — failures degrade to the rule-based path.
//
// Side-effects:
//   - Emits `agent:thinking`, `agent:result`, `memory:update`, and
//     `confidence:update` MissionEvents via missionEmitter.
//   - Updates MissionState.confidence via confidenceTracker.
//   - Mirrors memoryUpdate entries into MissionMemory via memoryLoop.

import type {
  AgentCapability,
  AgentId,
  AgentInfo,
  Task,
  TaskResult,
} from "../types";
import { BaseAgent } from "../base-agent";
import { callAIForJSON } from "../ai-client";
import type { AIProviderConfig, AIMessage } from "../ai-client";

import { missionEmitter } from "./event-emitter";
import { confidenceTracker } from "./confidence";
import { memoryLoop } from "./memory-loop";
import type { MissionState, ToolCall } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export type ReflectionSeverity = "info" | "warning" | "error" | "critical";

export type ReflectionMemoryCategory =
  | "issue"
  | "fix"
  | "convention"
  | "architecture"
  | "error-pattern";

export interface ReflectionMemoryUpdate {
  key: string;
  value: string;
  category: ReflectionMemoryCategory;
}

export interface ReflectionRecentEvent {
  action: string;
  tool: string;
  result: unknown;
  success: boolean;
  error?: string;
}

export interface ReflectionResult {
  /** Detailed analysis of what happened and why. */
  analysis: string;
  /** The underlying cause (not the symptom). */
  rootCause: string;
  /** How bad is this finding? */
  severity: ReflectionSeverity;
  /** Specific action to take next. */
  proposedAction: string;
  /** Delta to apply to Executive confidence (clamped to [-10, +10]). */
  confidenceAdjustment: number;
  /** True if we should retry with the proposed fix. */
  shouldRetry: boolean;
  /** True if the plan itself is wrong and needs revision. */
  shouldReplan: boolean;
  /** Findings to persist in mission memory. */
  memoryUpdate: ReflectionMemoryUpdate[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const MAX_CONFIDENCE_DELTA = 10;
const MIN_CONFIDENCE_DELTA = -10;

function clampDelta(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.max(MIN_CONFIDENCE_DELTA, Math.min(MAX_CONFIDENCE_DELTA, rounded));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asSeverity(value: unknown): ReflectionSeverity {
  if (
    value === "info" ||
    value === "warning" ||
    value === "error" ||
    value === "critical"
  ) {
    return value;
  }
  return "info";
}

function asCategory(value: unknown): ReflectionMemoryCategory {
  if (
    value === "issue" ||
    value === "fix" ||
    value === "convention" ||
    value === "architecture" ||
    value === "error-pattern"
  ) {
    return value;
  }
  return "issue";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ── Prompt construction ─────────────────────────────────────────────────────
function buildToolHistoryLines(history: ToolCall[]): string {
  if (history.length === 0) return "  (no actions yet)";
  return history
    .map((h) => {
      const resultStr =
        typeof h.result === "string"
          ? h.result
          : JSON.stringify(h.result) ?? "(no result)";
      const errStr = h.error ? ` — ERROR: ${h.error}` : "";
      return `  - [${h.success ? "OK" : "FAIL"}] ${h.tool}(${truncate(
        JSON.stringify(h.args),
        160,
      )}) → ${truncate(resultStr, 200)}${errStr}`;
    })
    .join("\n");
}

function buildReflectionPrompt(
  state: MissionState,
  recent: ReflectionRecentEvent,
): string {
  const recentHistory = state.toolHistory.slice(-5);
  const knownIssues =
    state.memory.knownIssues.length > 0
      ? state.memory.knownIssues.slice(-10).map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(none)";
  const memorySummary = memoryLoop.summarize(state.missionId);
  const resultStr =
    typeof recent.result === "string"
      ? recent.result
      : JSON.stringify(recent.result) ?? "(no result)";

  return `You are a Reflection Agent analyzing a software engineering mission.

GOAL: ${state.goal}
ITERATION: ${state.iteration}/${state.maxIterations}
CURRENT CONFIDENCE: ${state.confidence}%

RECENT ACTION:
- Action: ${recent.action}
- Tool: ${recent.tool}
- Result: ${recent.success ? "succeeded" : "failed"}
- Error: ${recent.error ?? "(none)"}
- Output: ${truncate(resultStr, 600)}

RECENT HISTORY (last ${recentHistory.length} actions):
${buildToolHistoryLines(recentHistory)}

KNOWN ISSUES:
${knownIssues}

MEMORY:
${memorySummary}

Analyze what just happened. If there was an error, identify the ROOT CAUSE (not just the symptom).
Propose a corrective action. Adjust confidence based on what you learned.

Return JSON ONLY (no prose, no markdown fences):
{
  "analysis": "detailed analysis of what happened and why",
  "rootCause": "the underlying cause (not symptom)",
  "severity": "info|warning|error|critical",
  "proposedAction": "specific action to take next",
  "confidenceAdjustment": -10 to +10,
  "shouldRetry": true/false,
  "shouldReplan": true/false,
  "memoryUpdate": [
    { "key": "...", "value": "...", "category": "issue|fix|convention|architecture|error-pattern" }
  ]
}`;
}

// ── Coercion (unknown → ReflectionResult) ──────────────────────────────────
function coerceReflectionResult(
  raw: unknown,
  state: MissionState,
  recent: ReflectionRecentEvent,
): ReflectionResult {
  if (!raw || typeof raw !== "object") {
    return ruleBasedReflection(state, recent);
  }
  const r = raw as Record<string, unknown>;

  const analysis = asString(r.analysis, "");
  const rootCause = asString(r.rootCause, "");
  const severity = asSeverity(r.severity);
  const proposedAction = asString(r.proposedAction, "");
  const confidenceAdjustment = clampDelta(r.confidenceAdjustment);
  const shouldRetry = asBool(r.shouldRetry, false);
  const shouldReplan = asBool(r.shouldReplan, false);

  const memoryUpdateRaw = Array.isArray(r.memoryUpdate) ? r.memoryUpdate : [];
  const memoryUpdate: ReflectionMemoryUpdate[] = [];
  for (const item of memoryUpdateRaw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const key = asString(m.key, "");
    const value = asString(m.value, "");
    if (!key || !value) continue;
    memoryUpdate.push({
      key,
      value,
      category: asCategory(m.category),
    });
  }

  // If the AI said it's an error/critical but didn't propose any memory update,
  // synthesize one so we never lose the finding.
  if (
    memoryUpdate.length === 0 &&
    (severity === "error" || severity === "critical") &&
    rootCause
  ) {
    memoryUpdate.push({
      key: `error:${state.iteration}`,
      value: rootCause,
      category: "error-pattern",
    });
  }

  return {
    analysis,
    rootCause,
    severity,
    proposedAction,
    confidenceAdjustment,
    shouldRetry,
    shouldReplan,
    memoryUpdate,
  };
}

// ── Rule-based reflection (no LLM required) ────────────────────────────────
interface RulePattern {
  match: RegExp;
  rootCause: string;
  proposedAction: string;
  severity: ReflectionSeverity;
  confidenceDelta: number;
  category: ReflectionMemoryCategory;
  shouldRetry: boolean;
  shouldReplan: boolean;
}

const RULE_PATTERNS: RulePattern[] = [
  {
    match: /Cannot find module ['"]([^'"]+)['"]/i,
    rootCause: "Missing import — module path is incorrect or package is not installed.",
    proposedAction: "Add the correct import statement or install the missing package.",
    severity: "error",
    confidenceDelta: -5,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /'use client'|"use client"/i,
    rootCause: "Client component is missing the 'use client' directive at the top of the file.",
    proposedAction: "Add 'use client'; as the first line of the component file.",
    severity: "error",
    confidenceDelta: -5,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /Type error|Type '[^']+' is not assignable to type/i,
    rootCause: "Type mismatch — a value does not match its declared type.",
    proposedAction: "Fix the type annotation or coerce the value to the correct type.",
    severity: "error",
    confidenceDelta: -5,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /SyntaxError|Unexpected token|Parsing error/i,
    rootCause: "Syntax error — the source file is not valid for its language.",
    proposedAction: "Fix the syntax (check for missing braces, brackets, semicolons, or quotes).",
    severity: "error",
    confidenceDelta: -6,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /Module not found|Failed to resolve/i,
    rootCause: "Module resolution failed — the import path is wrong or the file does not exist.",
    proposedAction: "Correct the import path or create the missing file.",
    severity: "error",
    confidenceDelta: -5,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /ENOENT|no such file or directory/i,
    rootCause: "File or directory does not exist.",
    proposedAction: "Create the missing file or correct the path.",
    severity: "warning",
    confidenceDelta: -3,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /EACCES|Permission denied/i,
    rootCause: "Permission denied — the process lacks filesystem access rights.",
    proposedAction: "Check file permissions or rerun with the appropriate privileges.",
    severity: "warning",
    confidenceDelta: -3,
    category: "issue",
    shouldRetry: false,
    shouldReplan: false,
  },
  {
    match: /ETIMEDOUT|timeout|TimeoutError/i,
    rootCause: "Operation timed out.",
    proposedAction: "Retry, possibly with a longer timeout or a smaller input.",
    severity: "warning",
    confidenceDelta: -2,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /tests? failed|test suite failed|FAIL\s/i,
    rootCause: "One or more tests are failing.",
    proposedAction: "Inspect the failing test output and fix the implementation or the test.",
    severity: "error",
    confidenceDelta: -4,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /lint error|eslint.*error/i,
    rootCause: "Lint errors detected.",
    proposedAction: "Run the linter and fix the reported issues.",
    severity: "warning",
    confidenceDelta: -2,
    category: "issue",
    shouldRetry: true,
    shouldReplan: false,
  },
  {
    match: /circular dependency|circular import/i,
    rootCause: "Circular import detected between modules.",
    proposedAction: "Refactor to break the cycle (extract shared code or use dynamic import).",
    severity: "warning",
    confidenceDelta: -4,
    category: "architecture",
    shouldRetry: false,
    shouldReplan: true,
  },
  {
    match: /out of memory|heap out of memory/i,
    rootCause: "Out of memory.",
    proposedAction: "Reduce input size or optimize memory usage.",
    severity: "critical",
    confidenceDelta: -8,
    category: "issue",
    shouldRetry: false,
    shouldReplan: true,
  },
];

/**
 * Rule-based reflection: pattern-matches the error string (if any) against
 * a catalog of common failure signatures and produces a structured result.
 * Used when no LLM provider is available or the LLM call fails.
 */
export function ruleBasedReflection(
  state: MissionState,
  recent: ReflectionRecentEvent,
): ReflectionResult {
  const errorText = recent.error ?? "";

  // Success path: no error → mild positive adjustment, no memory update needed.
  if (recent.success || !errorText) {
    return {
      analysis: recent.success
        ? `Action "${recent.action}" (${recent.tool}) succeeded. Progress is on track.`
        : `Action "${recent.action}" (${recent.tool}) reported no error; assuming success.`,
      rootCause: "",
      severity: "info",
      proposedAction: "Continue with the next planned step.",
      confidenceAdjustment: recent.success ? 2 : 0,
      shouldRetry: false,
      shouldReplan: false,
      memoryUpdate: [],
    };
  }

  // Find the first matching rule.
  for (const rule of RULE_PATTERNS) {
    const m = errorText.match(rule.match);
    if (m) {
      const captured = m[1] ? ` (${m[1]})` : "";
      const analysis = `Action "${recent.action}" (${recent.tool}) failed with: ${truncate(
        errorText,
        300,
      )}. Matched pattern: ${rule.rootCause}${captured}.`;
      return {
        analysis,
        rootCause: rule.rootCause,
        severity: rule.severity,
        proposedAction: rule.proposedAction,
        confidenceAdjustment: rule.confidenceDelta,
        shouldRetry: rule.shouldRetry,
        shouldReplan: rule.shouldReplan,
        memoryUpdate: [
          {
            key: `error:${state.iteration}:${recent.tool}`,
            value: `${rule.rootCause}${captured} — ${truncate(errorText, 160)}`,
            category: rule.category,
          },
        ],
      };
    }
  }

  // Generic failure fallback.
  return {
    analysis: `Action "${recent.action}" (${recent.tool}) failed with an unrecognized error: ${truncate(
      errorText,
      300,
    )}. Will retry with a different approach on the next iteration.`,
    rootCause: "Unrecognized error — manual investigation needed.",
    severity: "warning",
    proposedAction: "Try a different tool or gather more context before retrying.",
    confidenceAdjustment: -3,
    shouldRetry: true,
    shouldReplan: false,
    memoryUpdate: [
      {
        key: `error:${state.iteration}:${recent.tool}`,
        value: truncate(errorText, 200),
        category: "error-pattern",
      },
    ],
  };
}

// ── Reflection Agent class ─────────────────────────────────────────────────
export class ReflectionAgent extends BaseAgent {
  readonly id: AgentId = "reflection-agent";
  readonly info: AgentInfo = {
    id: "reflection-agent",
    name: "Reflection Agent",
    description:
      "Analyzes failures, identifies root causes, and proposes corrective actions after each ReAct iteration.",
    capabilities: [
      {
        kind: "custom",
        description: "Reflect on recent actions and failures",
      },
    ] as AgentCapability[],
    icon: "Brain",
    color: "#a78bfa",
  };

  /**
   * Reflect on the current mission state — called after each ReAct iteration
   * or when an error occurs.
   *
   * Side-effects:
   *   - Emits `agent:thinking`, `agent:result` MissionEvents.
   *   - Emits `memory:update` for each memoryUpdate entry.
   *   - Emits `confidence:update` with the (signed) adjustment.
   *   - Mutates the active mission's confidence via confidenceTracker.
   *   - Mirrors memoryUpdate entries into MissionMemory via memoryLoop.
   */
  async reflect(
    missionId: string,
    state: MissionState,
    recentEvent: ReflectionRecentEvent,
    provider?: AIProviderConfig,
    signal?: AbortSignal,
  ): Promise<ReflectionResult> {
    // Mark this mission as the active one for the ConfidenceTracker.
    confidenceTracker.setActive(missionId);

    const startedAt = Date.now();
    missionEmitter.emit({
      type: "agent:thinking",
      missionId,
      agent: this.id,
      message: recentEvent.success
        ? `Reflecting on success of ${recentEvent.tool}.`
        : `Reflecting on failure of ${recentEvent.tool}: ${truncate(
            recentEvent.error ?? "(unknown)",
            160,
          )}`,
      confidence: state.confidence,
      timestamp: startedAt,
    });
    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent: this.id,
      status: "thinking",
      detail: "Analyzing recent action and proposing next step.",
      timestamp: startedAt,
    });

    let result: ReflectionResult;
    if (provider) {
      try {
        result = await this.reflectWithAI(state, recentEvent, provider, signal);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Degrade gracefully to rule-based reflection.
        missionEmitter.emit({
          type: "error",
          missionId,
          message: `Reflection LLM call failed (${truncate(
            msg,
            160,
          )}); using rule-based fallback.`,
          recoverable: true,
          timestamp: Date.now(),
        });
        result = ruleBasedReflection(state, recentEvent);
      }
    } else {
      result = ruleBasedReflection(state, recentEvent);
    }

    // Apply confidence adjustment (clamped internally).
    confidenceTracker.adjustFor(
      missionId,
      result.confidenceAdjustment,
      result.analysis || result.rootCause || `Reflection on ${recentEvent.tool}`,
    );

    // Mirror memory updates into MissionMemory + emit memory:update events.
    if (result.memoryUpdate.length > 0) {
      memoryLoop.update(
        missionId,
        result.memoryUpdate.map((m) => ({
          key: m.key,
          value: m.value,
          category: m.category,
        })),
      );
    }

    // Final agent:result emission.
    const summary = result.analysis || result.proposedAction || "Reflection complete";
    missionEmitter.emit({
      type: "agent:result",
      missionId,
      agent: this.id,
      success: result.severity !== "critical",
      summary: truncate(summary, 280),
      timestamp: Date.now(),
    });
    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent: this.id,
      status: "done",
      detail: truncate(summary, 200),
      timestamp: Date.now(),
    });

    return result;
  }

  // ── LLM-backed reflection ──────────────────────────────────────────────
  private async reflectWithAI(
    state: MissionState,
    recent: ReflectionRecentEvent,
    provider: AIProviderConfig,
    signal?: AbortSignal,
  ): Promise<ReflectionResult> {
    const prompt = buildReflectionPrompt(state, recent);
    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are the Reflection Agent of CodeInsight AI. You analyze what just happened in an autonomous software engineering mission, identify the root cause of any failure, and propose the next corrective action. Always respond with valid JSON only — no markdown, no prose.",
      },
      { role: "user", content: prompt },
    ];

    const raw = await callAIForJSON<unknown>(provider, messages, {
      temperature: 0.2,
      maxTokens: 1024,
      signal,
    });

    return coerceReflectionResult(raw, state, recent);
  }

  // ── BaseAgent contract ─────────────────────────────────────────────────
  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const missionId =
      typeof task.input.missionId === "string" ? task.input.missionId : task.id;
    const state = missionEmitter.getState(missionId);
    if (!state) {
      return {
        success: false,
        data: null,
        summary: `Reflection failed: no mission state for ${missionId}`,
        artifacts: [],
      };
    }

    const recentEvent = (task.input.recentEvent ?? {}) as Partial<
      ReflectionRecentEvent
    >;
    const recent: ReflectionRecentEvent = {
      action: typeof recentEvent.action === "string" ? recentEvent.action : task.title,
      tool: typeof recentEvent.tool === "string" ? recentEvent.tool : "(unknown)",
      result: recentEvent.result,
      success: recentEvent.success === true,
      error: typeof recentEvent.error === "string" ? recentEvent.error : undefined,
    };

    const provider = task.input.provider as AIProviderConfig | undefined;

    onProgress(10, "Starting reflection");
    const result = await this.reflect(missionId, state, recent, provider, signal);
    onProgress(100, `Reflection complete: ${truncate(result.analysis, 120)}`);

    return {
      success: result.severity !== "critical",
      data: result,
      summary: truncate(result.analysis || result.proposedAction, 280),
      artifacts: [],
      metrics: {
        confidenceAdjustment: result.confidenceAdjustment,
        shouldRetry: result.shouldRetry ? 1 : 0,
        shouldReplan: result.shouldReplan ? 1 : 0,
        memoryUpdates: result.memoryUpdate.length,
      },
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────────────────
export const reflectionAgent = new ReflectionAgent();
