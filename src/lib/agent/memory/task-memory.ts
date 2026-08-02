// CodeInsight AI — Task Memory (Layer 7, Memory Layer 2)
// Per-task state: plan, checkpoints, execution log.
// Stored in sessionStorage for resume capability.

import type {
  TaskMemory as ITaskMemory,
  ExecutionPlan,
  Checkpoint,
  ExecutionLogEntry,
} from "../contracts";
import { CheckpointManager } from "../runtime/checkpoint-manager";

export class TaskMemoryImpl implements ITaskMemory {
  taskId: string;
  query: string;
  plan: ExecutionPlan | null = null;
  checkpoints: Checkpoint[] = [];
  executionLog: ExecutionLogEntry[] = [];

  private readonly checkpointManager: CheckpointManager;

  constructor(taskId: string, query: string) {
    this.taskId = taskId;
    this.query = query;
    this.checkpointManager = new CheckpointManager();
  }

  /** Save a checkpoint after a node completes */
  saveCheckpoint(nodeId: string): void {
    if (!this.plan) return;

    const completedNodeIds = this.executionLog
      .filter((e) => e.result !== undefined)
      .map((e) => e.nodeId);

    const cp = this.checkpointManager.save(
      this.taskId,
      this.plan,
      completedNodeIds,
      nodeId,
      null,
    );
    this.checkpoints.push(cp);

    // Persist to sessionStorage (best-effort)
    this.persist();
  }

  /** Load the latest checkpoint */
  loadCheckpoint(): Checkpoint | null {
    return this.checkpointManager.load(this.taskId);
  }

  /** Add an execution log entry */
  addLogEntry(entry: ExecutionLogEntry): void {
    this.executionLog.push(entry);
    this.persist();
  }

  /** Get execution log entries for a specific node */
  getLogForNode(nodeId: string): ExecutionLogEntry[] {
    return this.executionLog.filter((e) => e.nodeId === nodeId);
  }

  /** Get total execution time */
  getTotalDuration(): number {
    return this.executionLog.reduce((sum, e) => sum + e.duration, 0);
  }

  /** Check if a node has been executed */
  hasNodeExecuted(nodeId: string): boolean {
    return this.executionLog.some((e) => e.nodeId === nodeId);
  }

  /** Persist to sessionStorage (best-effort, may fail on quota) */
  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      const data = {
        taskId: this.taskId,
        query: this.query,
        executionLog: this.executionLog.slice(-50), // keep last 50 entries
      };
      sessionStorage.setItem(`agent-task-${this.taskId}`, JSON.stringify(data));
    } catch {
      // sessionStorage quota exceeded — silent
    }
  }

  /** Load from sessionStorage */
  static load(taskId: string): TaskMemoryImpl | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`agent-task-${taskId}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const tm = new TaskMemoryImpl(data.taskId, data.query);
      tm.executionLog = data.executionLog || [];
      return tm;
    } catch {
      return null;
    }
  }
}
