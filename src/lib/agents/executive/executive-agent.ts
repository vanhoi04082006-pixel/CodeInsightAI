// CodeInsight AI — Executive Agent
// Phase A: The main agent that drives the ReAct loop. Extends BaseAgent and
// exposes a `startMission()` entry-point used by the /api/mission/* routes.
//
// The Executive Agent is registered with the agent registry under the
// "orchestrator" id (reused — the legacy orchestrator remains available via
// the existing `runAutonomousWorkflow` import). The new agent is invoked
// directly by the API route via `startMission()`, not through the task queue,
// so that mission lifecycle + SSE streaming are easy to control.

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
import { ReActLoop } from "./react-loop";
import type {
  AgentInvocation,
  ExecutiveDecision,
  MissionContext,
  MissionEvent,
  MissionMemory,
  MissionState,
  MissionStats,
  ToolCall,
} from "./types";

// ── Public startMission options ─────────────────────────────────────────────
export interface StartMissionOptions {
  goal: string;
  repositoryUrl?: string;
  cwd?: string;
  provider?: AIProviderConfig;
  maxIterations?: number;
}

export interface StartMissionResult {
  missionId: string;
}

// ── In-flight mission registry (so background runs can be inspected) ────────
interface MissionRuntime {
  controller: AbortController;
  startedAt: number;
  promise: Promise<MissionState>;
}

const activeMissions = new Map<string, MissionRuntime>();

// ── Executive Agent class ───────────────────────────────────────────────────
class ExecutiveAgentImpl extends BaseAgent {
  readonly id: AgentId = "orchestrator"; // reuse orchestrator slot
  readonly info: AgentInfo = {
    id: "orchestrator",
    name: "Executive Agent",
    description:
      "Autonomous agent that uses a ReAct loop (Observe→Think→Act→Verify→Reflect→Decide) to coordinate the 11 specialist agents and complete software-engineering missions.",
    capabilities: [
      {
        kind: "custom",
        description:
          "Run an autonomous mission with dynamic tool selection via the ReAct loop",
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

    // Build the MissionContext that the loop will use.
    const ctx: MissionContext = {
      missionId,
      goal,
      repositoryUrl,
      cwd,
      provider,
      signal,
      emit: (event: MissionEvent) => missionEmitter.emit(event),
      getState: () => missionEmitter.getState(missionId)!,
      updateState: (updates) => missionEmitter.updateState(missionId, updates),
      updateMemory: (updates: Partial<MissionMemory>) =>
        missionEmitter.updateMemory(missionId, updates),
      recordToolCall: (call: ToolCall) =>
        missionEmitter.recordToolCall(missionId, call),
      recordAgentInvocation: (inv: AgentInvocation) =>
        missionEmitter.recordAgentInvocation(missionId, inv),
      recordDecision: (decision: ExecutiveDecision) =>
        missionEmitter.recordDecision(missionId, decision),
      recordFileChange: (p, action, additions, deletions) =>
        missionEmitter.recordFileChange(missionId, p, action, additions, deletions),
      recordTerminalOutput: (stream, data) =>
        missionEmitter.recordTerminalOutput(missionId, stream, data),
    };

    const loop = new ReActLoop(missionId, {
      maxIterations,
      provider,
    });

    onProgress(10, "ReAct loop starting");
    const finalState = await loop.run(goal, ctx);

    onProgress(
      100,
      finalState.status === "completed"
        ? `Mission completed (${finalState.iteration} iterations, confidence ${finalState.confidence}%)`
        : `Mission ${finalState.status}`,
    );

    return this.buildResult(finalState, goal);
  }

  private buildResult(state: MissionState, goal: string): TaskResult {
    const stats: MissionStats = {
      iterations: state.iteration,
      toolsCalled: state.toolHistory.length,
      agentsInvoked: state.agentHistory.length,
      filesModified: state.filesModified.length,
      decisions: state.decisions.length,
      errors: state.errors.length,
      finalConfidence: state.confidence,
    };

    const durationMs = Date.now() - state.startedAt;
    const summary =
      state.status === "completed"
        ? `Mission completed in ${durationMs}ms across ${state.iteration} iterations (confidence ${state.confidence}%). Tools called: ${stats.toolsCalled}. Files modified: ${stats.filesModified}.`
        : `Mission ${state.status} after ${durationMs}ms (${state.iteration} iterations). Errors: ${state.errors.length}.`;

    // Emit a final mission:completed event for SSE consumers.
    missionEmitter.emit({
      type: "mission:completed",
      missionId: state.missionId,
      success: state.status === "completed",
      summary,
      durationMs,
      stats,
      timestamp: Date.now(),
    });

    const report = [
      "# Mission Report",
      "",
      `**Goal:** ${goal}`,
      `**Status:** ${state.status}`,
      `**Iterations:** ${state.iteration}/${state.maxIterations}`,
      `**Confidence:** ${state.confidence}%`,
      `**Duration:** ${durationMs}ms`,
      `**Tools called:** ${stats.toolsCalled}`,
      `**Agents invoked:** ${stats.agentsInvoked}`,
      `**Files modified:** ${stats.filesModified}`,
      `**Decisions:** ${stats.decisions}`,
      `**Errors:** ${stats.errors}`,
      "",
      "## Files Modified",
      state.filesModified.length === 0
        ? "(none)"
        : state.filesModified.map((f) => `- ${f}`).join("\n"),
      "",
      "## Decisions",
      state.decisions.length === 0
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
      state.errors.length === 0 ? "(none)" : state.errors.map((e) => `- ${e}`).join("\n"),
    ].join("\n");

    return {
      success: state.status === "completed",
      data: {
        missionId: state.missionId,
        status: state.status,
        stats,
        state,
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
      },
    };
  }
}

// ── Singleton instance ──────────────────────────────────────────────────────
export const executiveAgent = new ExecutiveAgentImpl();

// ── Public entry-point used by API routes ───────────────────────────────────
/**
 * Start a mission in the background. Returns immediately with the missionId;
 * the actual ReAct loop runs detached. Subscribe via `missionEmitter.subscribe`
 * or GET /api/mission/stream?missionId=... to follow progress.
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

  activeMissions.set(missionId, {
    controller,
    startedAt,
    promise,
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

/** Cancel a running mission. */
export function cancelMission(missionId: string): boolean {
  const runtime = activeMissions.get(missionId);
  if (!runtime) return false;
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
