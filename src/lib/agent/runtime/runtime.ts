// CodeInsight AI — Agent Runtime (Layer 7)
// Event-Driven DAG executor with pause/resume/cancel/rollback.
// The Runtime is the "heart" of the Agent system — it coordinates all execution.

import type {
  AgentRuntime as IAgentRuntime,
  ExecutionPlan,
  AgentContext,
  AgentEvent,
  Checkpoint,
  Tool,
} from "../contracts";
import { EventBusImpl, createEventBus, makeEvent } from "./event-bus";
import { PermissionGateImpl } from "./permission-gate";
import { CheckpointManager } from "./checkpoint-manager";
import { RollbackManager } from "./rollback-manager";
import { ExecutionEngine } from "./execution-engine";

export class AgentRuntimeImpl implements IAgentRuntime {
  readonly eventBus: EventBusImpl;
  readonly permissionGate: PermissionGateImpl;
  readonly checkpointManager: CheckpointManager;
  readonly rollbackManager: RollbackManager;

  private activeEngines = new Map<string, ExecutionEngine>();
  private toolRegistry: { get: (name: string) => Tool | null };

  // Store context for resume — keyed by taskId.
  // v2.0 fix: the run() finally block previously deleted the context BEFORE
  // resume() could read it (because pause() causes execute() to return,
  // triggering finally). Now we only delete on non-paused exits, and pause()
  // marks the task as paused so resume() can find the context.
  private contextStore = new Map<string, AgentContext>();
  // Audit fix F4: pausedTasks now has TTL — abandoned paused tasks are evicted.
  private pausedTasks = new Set<string>();
  private pausedAt = new Map<string, number>(); // taskId → timestamp
  private readonly PAUSED_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(toolRegistry: { get: (name: string) => Tool | null }) {
    this.eventBus = createEventBus();
    this.permissionGate = new PermissionGateImpl(this.eventBus);
    this.checkpointManager = new CheckpointManager();
    this.rollbackManager = new RollbackManager();
    this.toolRegistry = toolRegistry;
  }

  /**
   * Run an ExecutionPlan.
   * Yields AgentEvent as they occur — UI subscribes to render progress.
   *
   * v2.2 fix (C5): accepts an optional taskId parameter so the API route
   * can pass its own taskId (used for cancel/permission correlation).
   * v2.0 generated a separate internal taskId, causing cancel() to never
   * find the engine.
   */
  async *run(
    plan: ExecutionPlan,
    context: AgentContext,
    taskId?: string,
  ): AsyncGenerator<AgentEvent> {
    const tid = taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const engine = new ExecutionEngine(tid, {
      eventBus: this.eventBus,
      permissionGate: this.permissionGate,
      checkpointManager: this.checkpointManager,
      rollbackManager: this.rollbackManager,
      toolRegistry: this.toolRegistry,
    });

    this.activeEngines.set(tid, engine);
    this.contextStore.set(tid, context);

    try {
      yield* engine.execute(plan, context);
    } finally {
      this.activeEngines.delete(tid);
      // Only delete context if not paused — paused tasks keep context for resume().
      if (!this.pausedTasks.has(tid)) {
        this.contextStore.delete(tid);
      }
    }
  }

  /** Cancel a running task */
  cancel(taskId: string): void {
    this.evictExpiredPaused(); // F4: cleanup before processing
    this.pausedTasks.delete(taskId);
    this.pausedAt.delete(taskId);
    const engine = this.activeEngines.get(taskId);
    if (engine) {
      engine.cancel();
    }
    this.contextStore.delete(taskId);
  }

  /** Pause a running task */
  pause(taskId: string): void {
    const engine = this.activeEngines.get(taskId);
    if (engine) {
      this.pausedTasks.add(taskId);
      this.pausedAt.set(taskId, Date.now());
      engine.pause();
    }
  }

  /** Audit fix F4: Evict paused tasks older than TTL */
  private evictExpiredPaused(): void {
    const now = Date.now();
    for (const [taskId, timestamp] of this.pausedAt) {
      if (now - timestamp > this.PAUSED_TTL_MS) {
        this.pausedTasks.delete(taskId);
        this.pausedAt.delete(taskId);
        this.contextStore.delete(taskId);
      }
    }
  }

  /** Resume a paused task from checkpoint */
  async *resume(taskId: string): AsyncGenerator<AgentEvent> {
    const checkpoint = this.checkpointManager.load(taskId);
    if (!checkpoint) {
      yield makeEvent({
        type: "task.failed",
        error: {
          code: "RUNTIME_CHECKPOINT_FAILED",
          message: `No checkpoint found for task: ${taskId}`,
          recoverable: false,
        },
      });
      return;
    }

    // Retrieve stored context (kept alive by pause() not deleting it)
    const context = this.contextStore.get(taskId);
    if (!context) {
      yield makeEvent({
        type: "task.failed",
        error: {
          code: "RUNTIME_CHECKPOINT_FAILED",
          message: `No context found for task: ${taskId}. The task may have completed or been cancelled.`,
          recoverable: false,
        },
      });
      return;
    }

    // Restore working memory from checkpoint snapshot (deep-cloned at save time)
    if (checkpoint.memory && context.memory?.working) {
      const m = checkpoint.memory as any;
      context.memory.working.update({
        currentHypothesis: m.currentHypothesis ?? null,
        currentFile: m.currentFile ?? null,
        currentFunction: m.currentFunction ?? null,
        currentSymbol: m.currentSymbol ?? null,
        currentStep: m.currentStep ?? null,
        currentBug: m.currentBug ?? null,
        scratchpad: Array.isArray(m.scratchpad) ? [...m.scratchpad] : [],
        pendingChoices: Array.isArray(m.pendingChoices) ? [...m.pendingChoices] : [],
      });
    }

    // Mark completed nodes as done in the plan
    const updatedPlan = CheckpointManager.markCompleted(
      checkpoint.plan,
      checkpoint.completedNodeIds,
    );

    // Recreate engine and resume
    const engine = new ExecutionEngine(taskId, {
      eventBus: this.eventBus,
      permissionGate: this.permissionGate,
      checkpointManager: this.checkpointManager,
      rollbackManager: this.rollbackManager,
      toolRegistry: this.toolRegistry,
    });

    this.activeEngines.set(taskId, engine);
    this.pausedTasks.delete(taskId);

    yield makeEvent({ type: "task.resumed", nodeId: checkpoint.currentNodeId ?? "" });

    try {
      yield* engine.execute(updatedPlan, context);
    } finally {
      this.activeEngines.delete(taskId);
      this.contextStore.delete(taskId);
    }
  }

  /** Get the latest checkpoint for a task */
  getCheckpoint(taskId: string): Checkpoint | null {
    return this.checkpointManager.load(taskId);
  }

  /** Check if a task is currently running */
  isRunning(taskId: string): boolean {
    return this.activeEngines.has(taskId);
  }

  /** Get all active task IDs */
  getActiveTasks(): string[] {
    return [...this.activeEngines.keys()];
  }
}

/** Create a new AgentRuntime with a tool registry */
export function createRuntime(
  toolRegistry: { get: (name: string) => Tool | null },
): AgentRuntimeImpl {
  return new AgentRuntimeImpl(toolRegistry);
}
