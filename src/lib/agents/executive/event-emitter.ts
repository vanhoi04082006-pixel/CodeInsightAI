// CodeInsight AI — Mission Event Emitter (singleton)
// Phase A: Real-time mission event source for SSE streaming.
//
// Responsibilities:
//   - Hold the canonical MissionState for each active/finished mission.
//   - Fan-out MissionEvents to subscribers (typically the SSE route handler).
//   - Provide ergonomic record*() helpers used by the ReAct loop.
//
// The emitter is process-wide (module singleton). Subscribers may attach
// after a mission has started — they will immediately receive the current
// snapshot via the `mission:status` event when they call `subscribe()`.

import type {
  AgentInvocation,
  ExecutiveDecision,
  MissionEvent,
  MissionMemory,
  MissionState,
  ToolCall,
} from "./types";

interface MissionEntry {
  state: MissionState;
  subscribers: Set<(event: MissionEvent) => void>;
  /** Buffered events sent to late subscribers (capped to avoid memory growth). */
  replayBuffer: MissionEvent[];
}

const MAX_REPLAY = 500;

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultMemory(): MissionMemory {
  return {
    keyFiles: new Map(),
    knownIssues: [],
    attemptedFixes: [],
    architectureNotes: [],
    conventions: [],
  };
}

class MissionEventEmitter {
  private missions = new Map<string, MissionEntry>();

  /** Create a new mission state and emit `mission:started`. */
  startMission(
    missionId: string,
    goal: string,
    repositoryUrl?: string,
    cwd: string = process.cwd(),
    maxIterations: number = 25,
  ): MissionState {
    const now = Date.now();
    const state: MissionState = {
      missionId,
      goal,
      repositoryUrl,
      cwd,
      status: "planning",
      currentPhase: "observe",
      iteration: 0,
      maxIterations,
      confidence: 0,
      memory: defaultMemory(),
      toolHistory: [],
      agentHistory: [],
      decisions: [],
      errors: [],
      filesModified: [],
      buildStatus: "pending",
      testStatus: "pending",
      startedAt: now,
      updatedAt: now,
    };
    this.missions.set(missionId, {
      state,
      subscribers: new Set(),
      replayBuffer: [],
    });
    this.emit({
      type: "mission:started",
      missionId,
      goal,
      repositoryUrl,
      timestamp: now,
    });
    return state;
  }

  /** Emit a MissionEvent to all subscribers of the given mission. */
  emit(event: MissionEvent): void {
    const entry = this.missions.get(event.missionId);
    if (!entry) {
      // Mission is unknown — silently drop. This can happen if the mission
      // was pruned before a late event arrived.
      return;
    }
    entry.replayBuffer.push(event);
    if (entry.replayBuffer.length > MAX_REPLAY) {
      entry.replayBuffer.shift();
    }
    for (const handler of entry.subscribers) {
      try {
        handler(event);
      } catch (err) {
        // Never let a faulty subscriber break emission.
        console.error("[mission-emitter] subscriber error:", err);
      }
    }
  }

  /**
   * Subscribe to MissionEvents for `missionId`.
   * Returns an unsubscribe function. Late subscribers immediately receive the
   * current mission status via a synthetic `mission:status` event, followed
   * by the replay buffer.
   */
  subscribe(
    missionId: string,
    handler: (event: MissionEvent) => void,
  ): () => void {
    let entry = this.missions.get(missionId);
    if (!entry) {
      // Create a placeholder so the subscriber is registered even before
      // the mission has formally started (e.g. very fast SSE connection).
      entry = {
        state: {
          missionId,
          goal: "",
          cwd: process.cwd(),
          status: "idle",
          currentPhase: "observe",
          iteration: 0,
          maxIterations: 25,
          confidence: 0,
          memory: defaultMemory(),
          toolHistory: [],
          agentHistory: [],
          decisions: [],
          errors: [],
          filesModified: [],
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        subscribers: new Set(),
        replayBuffer: [],
      };
      this.missions.set(missionId, entry);
    }
    entry.subscribers.add(handler);

    // Replay buffered events so late subscribers don't miss history.
    for (const evt of entry.replayBuffer) {
      try {
        handler(evt);
      } catch (err) {
        console.error("[mission-emitter] replay error:", err);
      }
    }

    return () => {
      const e = this.missions.get(missionId);
      if (!e) return;
      e.subscribers.delete(handler);
    };
  }

  /** Get a snapshot of the mission state. */
  getState(missionId: string): MissionState | undefined {
    return this.missions.get(missionId)?.state;
  }

  /** Merge partial updates into mission state. Emits `mission:status` if status changed. */
  updateState(missionId: string, updates: Partial<MissionState>): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    const prevStatus = entry.state.status;
    const prevPhase = entry.state.currentPhase;
    Object.assign(entry.state, updates, { updatedAt: Date.now() });

    if (updates.status && updates.status !== prevStatus) {
      this.emit({
        type: "mission:status",
        missionId,
        status: updates.status,
        timestamp: entry.state.updatedAt,
      });
    }
    if (updates.currentPhase && updates.currentPhase !== prevPhase) {
      this.emit({
        type: "react:phase",
        missionId,
        phase: updates.currentPhase,
        iteration: entry.state.iteration,
        timestamp: entry.state.updatedAt,
      });
    }
  }

  /** Merge partial updates into mission memory. Emits `memory:update` for each key. */
  updateMemory(missionId: string, updates: Partial<MissionMemory>): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    const mem = entry.state.memory;
    if (updates.repositoryStructure !== undefined) {
      mem.repositoryStructure = updates.repositoryStructure;
      this.emit({
        type: "memory:update",
        missionId,
        key: "repositoryStructure",
        value: updates.repositoryStructure,
        timestamp: Date.now(),
      });
    }
    if (updates.knownIssues !== undefined) mem.knownIssues = updates.knownIssues;
    if (updates.attemptedFixes !== undefined) mem.attemptedFixes = updates.attemptedFixes;
    if (updates.architectureNotes !== undefined) mem.architectureNotes = updates.architectureNotes;
    if (updates.conventions !== undefined) mem.conventions = updates.conventions;
    if (updates.keyFiles) {
      for (const [k, v] of updates.keyFiles.entries()) {
        mem.keyFiles.set(k, v);
        this.emit({
          type: "memory:update",
          missionId,
          key: `keyFiles:${k}`,
          value: v,
          timestamp: Date.now(),
        });
      }
    }
    entry.state.updatedAt = Date.now();
  }

  /** Append a tool call to the mission history and emit tool:call + tool:result. */
  recordToolCall(missionId: string, call: ToolCall): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    entry.state.toolHistory.push(call);
    this.emit({
      type: "tool:call",
      missionId,
      tool: call.tool,
      args: call.args,
      timestamp: call.timestamp,
    });
    this.emit({
      type: "tool:result",
      missionId,
      tool: call.tool,
      success: call.success,
      result: call.result,
      durationMs: call.durationMs,
      timestamp: call.timestamp,
    });
    entry.state.updatedAt = Date.now();
  }

  /** Append an agent invocation to the mission history. */
  recordAgentInvocation(missionId: string, inv: AgentInvocation): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    entry.state.agentHistory.push(inv);
    this.emit({
      type: "agent:result",
      missionId,
      agent: inv.agentId,
      success: inv.success,
      summary:
        (inv.result !== undefined &&
          typeof inv.result === "object" &&
          inv.result !== null &&
          "summary" in inv.result &&
          typeof (inv.result as { summary?: unknown }).summary === "string" &&
          (inv.result as { summary: string }).summary) ||
        (inv.success ? "completed" : inv.error || "failed"),
      timestamp: inv.timestamp,
    });
    entry.state.updatedAt = Date.now();
  }

  /** Record a decision and emit the `decision` event. */
  recordDecision(missionId: string, decision: ExecutiveDecision): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    entry.state.decisions.push(decision);
    this.emit({
      type: "decision",
      missionId,
      decision,
      timestamp: decision.timestamp,
    });
    if (decision.confidence !== entry.state.confidence) {
      entry.state.confidence = decision.confidence;
      this.emit({
        type: "confidence:update",
        missionId,
        confidence: decision.confidence,
        reason: decision.reasoning,
        timestamp: decision.timestamp,
      });
    }
    entry.state.updatedAt = Date.now();
  }

  /** Record a file change and update the filesModified list. */
  recordFileChange(
    missionId: string,
    path: string,
    action: "modified" | "added" | "deleted",
    additions: number,
    deletions: number,
  ): void {
    const entry = this.missions.get(missionId);
    if (!entry) return;
    if (!entry.state.filesModified.includes(path)) {
      entry.state.filesModified.push(path);
    }
    this.emit({
      type: "file:change",
      missionId,
      path,
      action,
      additions,
      deletions,
      timestamp: Date.now(),
    });
    entry.state.updatedAt = Date.now();
  }

  /** Emit a terminal output chunk (stdout/stderr). */
  recordTerminalOutput(
    missionId: string,
    stream: "stdout" | "stderr",
    data: string,
  ): void {
    this.emit({
      type: "terminal:output",
      missionId,
      stream,
      data,
      timestamp: Date.now(),
    });
  }

  /** Generate a fresh unique ID with the given prefix. */
  nextId(prefix: string): string {
    return genId(prefix);
  }

  /** List all known mission IDs (active + completed). */
  listMissions(): string[] {
    return Array.from(this.missions.keys());
  }

  /** Remove a mission from memory (used for cleanup after long retention). */
  prune(missionId: string): void {
    this.missions.delete(missionId);
  }
}

export const missionEmitter = new MissionEventEmitter();
