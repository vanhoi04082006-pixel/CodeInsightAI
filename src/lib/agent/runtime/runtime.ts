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

  // Store context for resume
  private contextStore = new Map<string, AgentContext>();

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
   */
  async *run(
    plan: ExecutionPlan,
    context: AgentContext,
  ): AsyncGenerator<AgentEvent> {
    const taskId = `task-${Date.now()}`;
    const engine = new ExecutionEngine(taskId, {
      eventBus: this.eventBus,
      permissionGate: this.permissionGate,
      checkpointManager: this.checkpointManager,
      rollbackManager: this.rollbackManager,
      toolRegistry: this.toolRegistry,
    });

    this.activeEngines.set(taskId, engine);
    this.contextStore.set(taskId, context);

    try {
      yield* engine.execute(plan, context);
    } finally {
      this.activeEngines.delete(taskId);
      this.contextStore.delete(taskId);
    }
  }

  /** Cancel a running task */
  cancel(taskId: string): void {
    const engine = this.activeEngines.get(taskId);
    if (engine) {
      engine.cancel();
    }
  }

  /** Pause a running task */
  pause(taskId: string): void {
    const engine = this.activeEngines.get(taskId);
    if (engine) {
      engine.pause();
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

    // Retrieve stored context
    const context = this.contextStore.get(taskId);
    if (!context) {
      yield makeEvent({
        type: "task.failed",
        error: {
          code: "RUNTIME_CHECKPOINT_FAILED",
          message: `No context found for task: ${taskId}. Context must be provided when creating the runtime.`,
          recoverable: false,
        },
      });
      return;
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

    yield makeEvent({ type: "task.resumed", nodeId: checkpoint.currentNodeId ?? "" });

    try {
      yield* engine.execute(updatedPlan, context);
    } finally {
      this.activeEngines.delete(taskId);
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
