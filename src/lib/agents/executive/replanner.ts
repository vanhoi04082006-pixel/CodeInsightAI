// CodeInsight AI — Replanner (Phase E)
// Dynamic re-planning when a mission encounters repeated failures.
//
// Responsibilities:
//   - Analyze a failure (failed action + error message + iteration).
//   - Produce a PlanRevision: a new approach broken into newSubGoals,
//     with explicit skipSteps (no longer needed) and addedSteps (new
//     prerequisites).
//   - Track revision history per mission and enforce a max-revisions cap.
//   - Emit MissionEvents (`agent:thinking`, `decision`, `memory:update`)
//     so the SSE stream reflects replanning in real time.
//
// When no AI provider is configured (or the call fails), a rule-based
// fallback inspects the error message and proposes a concrete remediation
// step (install deps, fix types, review tests, etc.).

import { callAIForJSON } from "@/lib/agents/ai-client";
import type { AIProviderConfig, AIMessage } from "@/lib/agents/ai-client";
import { missionEmitter } from "./event-emitter";
import type { MissionState } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export interface PlanRevision {
  revisionNumber: number;
  reason: string;
  analysis: string;
  originalPlan: string;
  revisedPlan: string;
  newSubGoals: string[];
  skipSteps: string[];
  addedSteps: string[];
  confidence: number;
  timestamp: number;
}

export interface ReplanFailure {
  action: string;
  error: string;
  iteration: number;
}

interface ReplanAIResponse {
  analysis: string;
  revisedPlan: string;
  newSubGoals: string[];
  skipSteps: string[];
  addedSteps: string[];
  confidence: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function summarizeMemory(state: MissionState): string {
  const mem = state.memory;
  const parts: string[] = [];
  parts.push(
    `keyFiles: ${mem.keyFiles.size} entries (${Array.from(mem.keyFiles.keys()).slice(0, 5).join(", ")})`,
  );
  if (mem.knownIssues.length > 0) {
    parts.push(
      `knownIssues: ${mem.knownIssues.slice(-5).map((s) => `"${s}"`).join("; ")}`,
    );
  }
  if (mem.attemptedFixes.length > 0) {
    parts.push(
      `attemptedFixes: ${mem.attemptedFixes.slice(-5).map((s) => `"${s}"`).join("; ")}`,
    );
  }
  if (mem.architectureNotes.length > 0) {
    parts.push(`architectureNotes: ${mem.architectureNotes.length} notes`);
  }
  if (mem.conventions.length > 0) {
    parts.push(`conventions: ${mem.conventions.length}`);
  }
  return parts.join(" | ");
}

function summarizeToolHistory(state: MissionState): string {
  const recent = state.toolHistory.slice(-6);
  if (recent.length === 0) return "(no actions yet)";
  return recent
    .map((h, i) => {
      const args = JSON.stringify(h.args).slice(0, 180);
      const result =
        typeof h.result === "string"
          ? h.result.slice(0, 180)
          : JSON.stringify(h.result).slice(0, 180);
      return `  ${i + 1}. [${h.success ? "OK" : "FAIL"}] ${h.tool}(${args}) → ${result}`;
    })
    .join("\n");
}

function deriveCurrentPlan(state: MissionState): string {
  const parts: string[] = [state.goal];
  if (state.subGoals && state.subGoals.length > 0) {
    parts.push(
      `Sub-goals: ${state.subGoals.map((g, i) => `${i + 1}. ${g}`).join("; ")}`,
    );
  }
  const recent = state.decisions.slice(-3);
  if (recent.length > 0) {
    parts.push(
      `Recent decisions: ${recent.map((d) => `${d.action} (${d.confidence}%)`).join(" → ")}`,
    );
  }
  return parts.join(" | ");
}

function isReplanAIResponse(value: unknown): value is ReplanAIResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.analysis === "string" &&
    typeof v.revisedPlan === "string" &&
    (Array.isArray(v.newSubGoals) || v.newSubGoals === undefined) &&
    (Array.isArray(v.skipSteps) || v.skipSteps === undefined) &&
    (Array.isArray(v.addedSteps) || v.addedSteps === undefined) &&
    (typeof v.confidence === "number" || typeof v.confidence === "string")
  );
}

function coerceReplanResponse(raw: unknown): ReplanAIResponse {
  if (!isReplanAIResponse(raw)) {
    throw new Error("AI replan response did not match expected schema");
  }
  const asStrArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  const confidence =
    typeof raw.confidence === "number"
      ? Math.max(0, Math.min(100, raw.confidence))
      : Math.max(0, Math.min(100, parseInt(String(raw.confidence), 10) || 50));
  return {
    analysis: raw.analysis,
    revisedPlan: raw.revisedPlan,
    newSubGoals: asStrArray(raw.newSubGoals),
    skipSteps: asStrArray(raw.skipSteps),
    addedSteps: asStrArray(raw.addedSteps),
    confidence,
  };
}

// ── Rule-based fallback ─────────────────────────────────────────────────────
/**
 * Inspect the error message and produce a concrete remediation step.
 * Returns a fully-formed PlanRevision (confidence 30 — low but non-zero).
 */
function ruleBasedRevision(
  missionId: string,
  state: MissionState,
  failure: ReplanFailure,
  revisionNumber: number,
): PlanRevision {
  const err = failure.error || "";
  const lower = err.toLowerCase();

  let addedStep = "Re-examine the failure and try a different approach.";
  let analysis = `Tool "${failure.action}" failed at iteration ${failure.iteration} with error: ${err.slice(0, 200)}`;

  if (lower.includes("cannot find module")) {
    // Try to extract the module name from the error.
    const m = err.match(/cannot find module ['"]([^'"]+)['"]/i);
    const mod = m ? m[1] : "the missing dependency";
    addedStep = `Install missing dependency: ${mod}`;
    analysis = `The runtime could not resolve a module. The mission depends on a package that is not installed.`;
  } else if (
    lower.includes("type error") ||
    lower.includes("ts(") ||
    lower.includes("type '") ||
    lower.includes("argument of type")
  ) {
    // Try to extract a file path from the error.
    const m = err.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)):\d+/);
    const file = m ? m[1] : "the affected file";
    addedStep = `Fix type annotations in ${file}`;
    analysis = `A TypeScript type error blocked progress. The offending file needs type corrections before continuing.`;
  } else if (lower.includes("test") || lower.includes("assert")) {
    addedStep = "Review test expectations and update fixtures if needed";
    analysis = `A test failed. The expectations may be wrong, or the code under test regressed.`;
  } else if (lower.includes("enoent") || lower.includes("no such file")) {
    const m = err.match(/no such file or directory,? open ['"]?([^'"\n]+)/i);
    const file = m ? m[1] : "the missing file";
    addedStep = `Create missing file or fix path: ${file}`;
    analysis = `A file operation referenced a path that does not exist.`;
  } else if (lower.includes("permission") || lower.includes("eacces")) {
    addedStep = "Fix filesystem permissions or retry with adjusted cwd";
    analysis = `A file operation was denied due to insufficient permissions.`;
  } else if (lower.includes("command not found") || lower.includes("not executable")) {
    const m = err.match(/(\w+): command not found/);
    const cmd = m ? m[1] : "the command";
    addedStep = `Use a different command — ${cmd} is not available in this environment`;
    analysis = `The shell command is unavailable. Use an alternative (e.g. \`bunx\` instead of \`npx\`).`;
  } else if (lower.includes("exit code") || lower.includes("nonzero")) {
    addedStep = "Re-run the command with verbose output to diagnose the exit code";
    analysis = `A shell command exited non-zero. The stderr output suggests an environmental or argument issue.`;
  }

  const newSubGoals = [
    `Stop attempting: ${failure.action}`,
    addedStep,
    "Re-verify the fix with build/test before continuing",
  ];

  // Emit a low-confidence decision so the UI shows the rule-based revision.
  missionEmitter.emit({
    type: "agent:thinking",
    missionId,
    agent: "replanner",
    message: `Rule-based replan (no provider): ${addedStep}`,
    confidence: 30,
    timestamp: Date.now(),
  });

  return {
    revisionNumber,
    reason: `Failure: ${failure.action} → ${err.slice(0, 120)}`,
    analysis,
    originalPlan: deriveCurrentPlan(state),
    revisedPlan: `Rule-based revision: ${addedStep}`,
    newSubGoals,
    skipSteps: [failure.action],
    addedSteps: [addedStep],
    confidence: 30,
    timestamp: Date.now(),
  };
}

// ── Replanner class ─────────────────────────────────────────────────────────
export class Replanner {
  private readonly maxRevisions: number;
  private readonly history = new Map<string, PlanRevision[]>();

  constructor(maxRevisions = 5) {
    this.maxRevisions = maxRevisions;
  }

  /**
   * Analyze a failure and produce a revised plan.
   * Returns `null` when the mission has already exhausted its revision budget.
   */
  async replan(
    missionId: string,
    state: MissionState,
    failure: ReplanFailure,
    provider?: AIProviderConfig,
    signal?: AbortSignal,
  ): Promise<PlanRevision | null> {
    const revisions = this.history.get(missionId) ?? [];
    const revisionNumber = revisions.length + 1;

    if (revisionNumber > this.maxRevisions) {
      missionEmitter.emit({
        type: "error",
        missionId,
        message: `Replanner exhausted (${this.maxRevisions} revisions) — giving up.`,
        recoverable: false,
        timestamp: Date.now(),
      });
      return null;
    }

    // Emit "thinking" event so the UI shows replanning is in progress.
    missionEmitter.emit({
      type: "agent:thinking",
      missionId,
      agent: "replanner",
      message: `Replanning due to failure (revision ${revisionNumber}/${this.maxRevisions})…`,
      confidence: state.confidence,
      timestamp: Date.now(),
    });
    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent: "replanner",
      status: "thinking",
      detail: `Analyzing failure: ${failure.action} → ${failure.error.slice(0, 100)}`,
      timestamp: Date.now(),
    });

    let revision: PlanRevision;

    const hasProvider =
      provider &&
      provider.apiKey &&
      provider.apiKey.trim().length > 0 &&
      provider.baseUrl;

    if (hasProvider) {
      try {
        const aiResponse = await this.callReplanAI(
          missionId,
          state,
          failure,
          revisionNumber,
          provider as AIProviderConfig,
          signal,
        );
        revision = {
          revisionNumber,
          reason: `Failure: ${failure.action} → ${failure.error.slice(0, 120)}`,
          analysis: aiResponse.analysis,
          originalPlan: deriveCurrentPlan(state),
          revisedPlan: aiResponse.revisedPlan,
          newSubGoals: aiResponse.newSubGoals,
          skipSteps: aiResponse.skipSteps,
          addedSteps: aiResponse.addedSteps,
          confidence: aiResponse.confidence,
          timestamp: Date.now(),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        missionEmitter.emit({
          type: "error",
          missionId,
          message: `Replanner AI call failed (${msg}); using rule-based fallback.`,
          recoverable: true,
          timestamp: Date.now(),
        });
        revision = ruleBasedRevision(missionId, state, failure, revisionNumber);
      }
    } else {
      // No provider configured — use the rule-based fallback directly.
      revision = ruleBasedRevision(missionId, state, failure, revisionNumber);
    }

    // Store in history.
    revisions.push(revision);
    this.history.set(missionId, revisions);

    // Emit a decision event for the revised plan.
    missionEmitter.emit({
      type: "decision",
      missionId,
      decision: {
        id: missionEmitter.nextId("replan"),
        iteration: failure.iteration,
        phase: "reflect",
        reasoning: revision.analysis,
        action: `Replan #${revision.revisionNumber}: ${revision.revisedPlan}`,
        confidence: revision.confidence,
        timestamp: revision.timestamp,
      },
      timestamp: revision.timestamp,
    });

    // Emit a memory:update so the UI shows the new plan in the world-state panel.
    missionEmitter.emit({
      type: "memory:update",
      missionId,
      key: "currentPlan",
      value: {
        revisionNumber: revision.revisionNumber,
        revisedPlan: revision.revisedPlan,
        newSubGoals: revision.newSubGoals,
        skipSteps: revision.skipSteps,
        addedSteps: revision.addedSteps,
        confidence: revision.confidence,
      },
      timestamp: revision.timestamp,
    });

    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent: "replanner",
      status: "done",
      detail: `Revision #${revision.revisionNumber} ready (${revision.confidence}% confidence)`,
      timestamp: Date.now(),
    });

    return revision;
  }

  /** Return all revisions recorded for a mission (oldest first). */
  getHistory(missionId: string): PlanRevision[] {
    return [...(this.history.get(missionId) ?? [])];
  }

  /** True when the mission has not yet exceeded its revision budget. */
  canReplan(missionId: string): boolean {
    const count = this.history.get(missionId)?.length ?? 0;
    return count < this.maxRevisions;
  }

  /** Drop revision history for a mission (called on mission completion). */
  clear(missionId: string): void {
    this.history.delete(missionId);
  }

  // ── AI call ──────────────────────────────────────────────────────────────
  private async callReplanAI(
    missionId: string,
    state: MissionState,
    failure: ReplanFailure,
    revisionNumber: number,
    provider: AIProviderConfig,
    signal?: AbortSignal,
  ): Promise<ReplanAIResponse> {
    const currentPlan = deriveCurrentPlan(state);
    const memorySummary = summarizeMemory(state);
    const toolHistory = summarizeToolHistory(state);

    const prompt = `You are a Replanner for a software engineering mission that has encountered a failure.

GOAL: ${state.goal}
CURRENT ITERATION: ${failure.iteration}/${state.maxIterations}
REVISION NUMBER: ${revisionNumber}/${this.maxRevisions}

FAILURE:
- Failed action: ${failure.action}
- Error: ${failure.error}
- Iteration: ${failure.iteration}

CURRENT PLAN (what we were doing):
${currentPlan}

MEMORY (what we know):
${memorySummary}

RECENT HISTORY:
${toolHistory}

The current approach isn't working. Create a REVISED plan that:
1. Avoids repeating the same mistake
2. Breaks the goal into different sub-steps
3. May skip steps that are no longer needed
4. May add new prerequisite steps

Return JSON ONLY (no prose, no markdown fences):
{
  "analysis": "why the original approach failed and what needs to change",
  "revisedPlan": "high-level description of the new approach",
  "newSubGoals": ["step 1", "step 2"],
  "skipSteps": ["steps from original plan to skip"],
  "addedSteps": ["new steps to add before continuing"],
  "confidence": 0-100
}`;

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are the Replanner of CodeInsight AI. When a mission step fails, you analyze the failure and produce a concrete revised plan. Always respond with valid JSON only — no markdown, no prose.",
      },
      { role: "user", content: prompt },
    ];

    const raw = await callAIForJSON<unknown>(provider, messages, {
      temperature: 0.4,
      maxTokens: 1024,
      signal,
    });

    // Touch missionId so the linter doesn't complain about unused param
    // (the missionId is used by callers for tracing via the emitter).
    void missionId;

    return coerceReplanResponse(raw);
  }
}

// ── Singleton convenience ───────────────────────────────────────────────────
export const replanner = new Replanner();
