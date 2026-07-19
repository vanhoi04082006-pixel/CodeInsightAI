// CodeInsight AI — Executive Agent
// Phase A: The main agent that drives the ReAct loop. Extends BaseAgent and
// exposes a `startMission()` entry-point used by the /api/mission/* routes.
//
// Phase I: The Executive Agent now delegates to a ContinuousReasoningLoop
// instead of calling ReActLoop directly. The continuous loop:
//   - Runs ReAct cycles in batches of 1 (preserving ReActLoop's internal
//     state for the Phase E Reflection/Replanner/Rollback machinery).
//   - Runs a QualityGate every 5 iterations (and when the AI says
//     is_complete, and on the final iteration).
//   - Emits `mission:completed` with MissionStats (including qualityScore
//     and durationMs) when the gate passes.
//   - Is cancellable at any point via `cancelMission()` → `loop.abort()`.
//
// The agent is registered with the agent registry under the "orchestrator"
// id (reused — the legacy orchestrator remains available via the existing
// `runAutonomousWorkflow` import). The new agent is invoked directly by the
// API route via `startMission()`, not through the task queue, so that
// mission lifecycle + SSE streaming are easy to control.

import type {
  AgentCapability,
  AgentId,
  AgentInfo,
  Task,
  TaskResult,
} from "../types";
import { BaseAgent } from "../base-agent";
import { registerAllAgents } from "../index";
import type { AIProviderConfig } from "../ai-client";

import { missionEmitter } from "./event-emitter";
import { ContinuousReasoningLoop } from "./reasoning-loop";
import type {
  MissionState,
  MissionStats,
} from "./types";

// ── Public startMission options ─────────────────────────────────────────────
export interface StartMissionOptions {
  goal: string;
  repositoryUrl?: string;
  cwd?: string;
  provider?: AIProviderConfig;
  maxIterations?: number;
  /** Phase I: override the default quality thresholds. */
  qualityThresholds?: {
    build?: boolean;
    tests?: number;
    lint?: boolean;
    reviewScore?: number;
    confidence?: number;
  };
}

export interface StartMissionResult {
  missionId: string;
}

// ── In-flight mission registry (so background runs can be inspected) ────────
interface MissionRuntime {
  controller: AbortController;
  startedAt: number;
  promise: Promise<MissionState>;
  /** Phase I: the continuous reasoning loop driving this mission. */
  loop: ContinuousReasoningLoop;
}

const activeMissions = new Map<string, MissionRuntime>();

// ── Executive Agent class ───────────────────────────────────────────────────
class ExecutiveAgentImpl extends BaseAgent {
  readonly id: AgentId = "orchestrator"; // reuse orchestrator slot
  readonly info: AgentInfo = {
    id: "orchestrator",
    name: "Executive Agent",
    description:
      "Autonomous agent that uses a continuous ReAct loop (Observe→Think→Act→Verify→Reflect→Quality Gate) to coordinate the 11 specialist agents and complete software-engineering missions.",
    capabilities: [
      {
        kind: "custom",
        description:
          "Run an autonomous mission with dynamic tool selection via the continuous ReAct loop",
      },
    ] as AgentCapability[],
    icon: "Cpu",
    color: "#a855f7",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const goal =
      typeof task.input.goal === "string"
        ? task.input.goal
        : typeof task.title === "string"
          ? task.title
          : "Unspecified mission goal";
    const repositoryUrl =
      typeof task.input.repositoryUrl === "string"
        ? task.input.repositoryUrl
        : undefined;
    const cwd =
      typeof task.input.cwd === "string" ? task.input.cwd : process.cwd();
    const provider = task.input.provider as AIProviderConfig | undefined;
    const maxIterations =
      typeof task.input.maxIterations === "number"
        ? task.input.maxIterations
        : 25;
    const qualityThresholds = task.input.qualityThresholds as
      | {
          build?: boolean;
          tests?: number;
          lint?: boolean;
          reviewScore?: number;
          confidence?: number;
        }
      | undefined;

    // Initialize mission state in the emitter.
    const missionId = task.id;
    missionEmitter.startMission(
      missionId,
      goal,
      repositoryUrl,
      cwd,
      maxIterations,
    );

    onProgress(5, "Mission started");

    // ── Phase I: Continuous Reasoning Loop ──────────────────────────────
    // The loop wraps the existing ReActLoop and adds the QualityGate. It
    // returns MissionStats (with qualityScore + durationMs) and emits the
    // terminal `mission:completed` event itself.
    const loop = new ContinuousReasoningLoop();
    // Track the loop so cancelMission() can abort it.
    const runtime = activeMissions.get(missionId);
    if (runtime) {
      // Replace the placeholder runtime with one that knows about the loop.
      activeMissions.set(missionId, {
        controller: runtime.controller,
        startedAt: runtime.startedAt,
        promise: runtime.promise,
        loop,
      });
    }

    onProgress(10, "Continuous reasoning loop starting");

    let stats: MissionStats;
    try {
      stats = await loop.run(
        missionId,
        goal,
        { repositoryUrl, cwd, provider },
        {
          maxIterations,
          provider,
          signal,
          qualityThresholds,
          onPhase: (phase, iteration) => {
            const pct = Math.min(95, 10 + Math.round((iteration / maxIterations) * 80));
            onProgress(
              pct,
              `Phase: ${phase} (iteration ${iteration}/${maxIterations})`,
            );
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const state = missionEmitter.getState(missionId);
      const fallback: MissionStats = {
        iterations: state?.iteration ?? 0,
        toolsCalled: state?.toolHistory.length ?? 0,
        agentsInvoked: state?.agentHistory.length ?? 0,
        filesModified: state?.filesModified.length ?? 0,
        decisions: state?.decisions.length ?? 0,
        errors: (state?.errors.length ?? 0) + 1,
        finalConfidence: state?.confidence ?? 0,
        qualityScore: 0,
        durationMs: state ? Date.now() - state.startedAt : 0,
      };
      missionEmitter.updateState(missionId, { status: "failed" });
      missionEmitter.getState(missionId)?.errors.push(`Loop crashed: ${msg}`);
      missionEmitter.emit({
        type: "error",
        missionId,
        message: `Loop crashed: ${msg}`,
        recoverable: false,
        timestamp: Date.now(),
      });
      missionEmitter.emit({
        type: "mission:completed",
        missionId,
        success: false,
        summary: `Mission crashed: ${msg}`,
        durationMs: fallback.durationMs,
        stats: fallback,
        timestamp: Date.now(),
      });
      stats = fallback;
    }

    const finalState = missionEmitter.getState(missionId);
    onProgress(
      100,
      finalState?.status === "completed"
        ? `Mission completed (${stats.iterations} iterations, confidence ${stats.finalConfidence}%, quality ${stats.qualityScore}/100)`
        : `Mission ${finalState?.status ?? "unknown"}`,
    );

    return this.buildResult(finalState ?? null, goal, stats);
  }

  private buildResult(
    state: MissionState | null,
    goal: string,
    stats: MissionStats,
  ): TaskResult {
    const durationMs = stats.durationMs;
    const success = state?.status === "completed";
    const summary = success
      ? `Mission completed in ${durationMs}ms across ${stats.iterations} iterations (confidence ${stats.finalConfidence}%, quality ${stats.qualityScore}/100). Tools called: ${stats.toolsCalled}. Files modified: ${stats.filesModified}.`
      : `Mission ${state?.status ?? "unknown"} after ${durationMs}ms (${stats.iterations} iterations). Errors: ${stats.errors}. Quality score: ${stats.qualityScore}/100.`;

    // Note: the ContinuousReasoningLoop already emits the terminal
    // `mission:completed` event with full MissionStats. We do NOT re-emit
    // here to avoid duplicate events in the SSE stream.

    const report = [
      "# Mission Report",
      "",
      `**Goal:** ${goal}`,
      `**Status:** ${state?.status ?? "unknown"}`,
      `**Iterations:** ${stats.iterations}/${state?.maxIterations ?? "?"}`,
      `**Confidence:** ${stats.finalConfidence}%`,
      `**Quality Score:** ${stats.qualityScore}/100`,
      `**Duration:** ${durationMs}ms`,
      `**Tools called:** ${stats.toolsCalled}`,
      `**Agents invoked:** ${stats.agentsInvoked}`,
      `**Files modified:** ${stats.filesModified}`,
      `**Decisions:** ${stats.decisions}`,
      `**Errors:** ${stats.errors}`,
      "",
      "## Files Modified",
      !state || state.filesModified.length === 0
        ? "(none)"
        : state.filesModified.map((f) => `- ${f}`).join("\n"),
      "",
      "## Decisions",
      !state || state.decisions.length === 0
        ? "(none)"
        : state.decisions
            .slice(-20)
            .map(
              (d) =>
                `- [iter ${d.iteration}/${d.phase}] ${d.action} — ${d.reasoning} (${d.confidence}%)`,
            )
            .join("\n"),
      "",
      "## Errors",
      !state || state.errors.length === 0
        ? "(none)"
        : state.errors.map((e) => `- ${e}`).join("\n"),
    ].join("\n");

    return {
      success,
      data: {
        missionId: state?.missionId ?? "",
        status: state?.status ?? "failed",
        stats,
        state: state ?? null,
      },
      summary,
      artifacts: [
        {
          kind: "report",
          content: report,
          language: "markdown",
          meta: stats,
        },
      ],
      metrics: {
        iterations: stats.iterations,
        toolsCalled: stats.toolsCalled,
        agentsInvoked: stats.agentsInvoked,
        filesModified: stats.filesModified,
        finalConfidence: stats.finalConfidence,
        qualityScore: stats.qualityScore,
      },
    };
  }
}

// ── Singleton instance ──────────────────────────────────────────────────────
export const executiveAgent = new ExecutiveAgentImpl();

// ── Public entry-point used by API routes ───────────────────────────────────
/**
 * Start a mission in the background. Returns immediately with the missionId;
 * the actual ContinuousReasoningLoop runs detached. Subscribe via
 * `missionEmitter.subscribe` or GET /api/mission/stream?missionId=... to
 * follow progress.
 */
export async function startMission(
  options: StartMissionOptions,
): Promise<StartMissionResult> {
  if (!options.goal || typeof options.goal !== "string") {
    throw new Error("startMission: 'goal' is required");
  }

  // Ensure all 11 specialist agents are registered (idempotent).
  registerAllAgents();

  const missionId = `mission_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const controller = new AbortController();
  const startedAt = Date.now();

  // Pre-create the mission state in the emitter so SSE subscribers that
  // connect immediately get a coherent snapshot.
  missionEmitter.startMission(
    missionId,
    options.goal,
    options.repositoryUrl,
    options.cwd ?? process.cwd(),
    options.maxIterations ?? 25,
  );

  // Build a Task object that satisfies BaseAgent's contract.
  const task: Task = {
    id: missionId,
    kind: "custom",
    title: `Mission: ${options.goal.slice(0, 80)}`,
    description: `Autonomous mission started via /api/mission/start`,
    priority: "critical",
    status: "running",
    assignedAgent: "orchestrator",
    dependencies: [],
    input: {
      goal: options.goal,
      repositoryUrl: options.repositoryUrl,
      cwd: options.cwd ?? process.cwd(),
      provider: options.provider,
      maxIterations: options.maxIterations ?? 25,
      qualityThresholds: options.qualityThresholds,
    },
    createdAt: startedAt,
    startedAt,
    attempts: 1,
    maxAttempts: 1,
    timeoutMs: 30 * 60 * 1000, // 30 min hard cap
    progress: 0,
    subtaskIds: [],
  };

  // Run the executive agent detached. We discard the TaskResult (the canonical
  // mission state lives in missionEmitter) and only retain the final state.
  const promise: Promise<MissionState> = executiveAgent
    .run(task, controller.signal)
    .then(() => missionEmitter.getState(missionId)!)
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      missionEmitter.updateState(missionId, { status: "failed" });
      missionEmitter.getState(missionId)?.errors.push(`Mission crashed: ${msg}`);
      missionEmitter.emit({
        type: "error",
        missionId,
        message: `Mission crashed: ${msg}`,
        recoverable: false,
        timestamp: Date.now(),
      });
      return missionEmitter.getState(missionId)!;
    });

  // Pre-register a placeholder runtime so cancelMission() works even before
  // execute() has had a chance to swap in the loop instance. The placeholder
  // has a no-op loop wrapper.
  const placeholderLoop = new ContinuousReasoningLoop();
  activeMissions.set(missionId, {
    controller,
    startedAt,
    promise,
    loop: placeholderLoop,
  });

  // Clean up the activeMissions entry once it settles.
  void promise.finally(() => {
    // Keep the entry for a while so late SSE subscribers can fetch the final
    // state. The missionEmitter retains state indefinitely; this map only
    // tracks the live promise/controller.
    setTimeout(() => activeMissions.delete(missionId), 5 * 60 * 1000);
  });

  return { missionId };
}

/** Look up the current state of a mission. */
export async function getMissionState(
  missionId: string,
): Promise<MissionState | undefined> {
  return missionEmitter.getState(missionId);
}

/** Get the ContinuousReasoningLoop driving a mission (if active). */
export function getMissionLoop(
  missionId: string,
): ContinuousReasoningLoop | undefined {
  return activeMissions.get(missionId)?.loop;
}

/**
 * Cancel a running mission. Calls `continuousLoop.abort()` so the loop
 * stops at the next iteration boundary, and aborts the controller so any
 * in-flight tool calls (run_command, etc.) are killed immediately.
 */
export function cancelMission(missionId: string): boolean {
  const runtime = activeMissions.get(missionId);
  if (!runtime) return false;
  // Phase I: ask the continuous loop to abort gracefully first, then abort
  // the controller to kill any in-flight child processes.
  runtime.loop.abort();
  runtime.controller.abort();
  missionEmitter.updateState(missionId, { status: "cancelled" });
  return true;
}

/** Wait for a mission to finish (used in tests; not exposed via HTTP). */
export async function awaitMission(
  missionId: string,
): Promise<MissionState | undefined> {
  const runtime = activeMissions.get(missionId);
  if (runtime) {
    await runtime.promise;
  }
  return missionEmitter.getState(missionId);
}
