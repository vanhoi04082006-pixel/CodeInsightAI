// CodeInsight AI — Checkpoint Manager (Layer 7)
// Saves and loads execution checkpoints for pause/resume support.

import type { Checkpoint, ExecutionPlan, NodeStatus } from "../contracts";

export class CheckpointManager {
  private checkpoints = new Map<string, Checkpoint>();
  private maxCheckpoints = 50;
  private saveCounter = 0;

  /** Save a checkpoint after a node completes */
  save(
    taskId: string,
    plan: ExecutionPlan,
    completedNodeIds: string[],
    currentNodeId: string | null,
    workingMemory: any,
  ): Checkpoint {
    this.saveCounter++;
    // Deep-clone BOTH plan and working memory so the checkpoint is an
    // immutable snapshot. v1 stored `memory: workingMemory` (live reference)
    // which meant resume-after-pause saw the now-cleared working memory.
    const checkpoint: Checkpoint = {
      taskId,
      plan: JSON.parse(JSON.stringify(plan)), // deep clone
      completedNodeIds: [...completedNodeIds],
      currentNodeId,
      memory: workingMemory ? JSON.parse(JSON.stringify(workingMemory)) : null,
      timestamp: Date.now(),
    };

    // Enforce max checkpoints per task
    const taskCheckpoints = this.getTaskCheckpoints(taskId);
    if (taskCheckpoints.length >= this.maxCheckpoints) {
      // Remove oldest — find its key
      const oldest = taskCheckpoints[0];
      for (const [key, value] of this.checkpoints) {
        if (value === oldest) {
          this.checkpoints.delete(key);
          break;
        }
      }
    }

    this.checkpoints.set(taskId + ":" + checkpoint.timestamp + ":" + this.saveCounter, checkpoint);
    return checkpoint;
  }

  /** Load the latest checkpoint for a task */
  load(taskId: string): Checkpoint | null {
    const taskCheckpoints = this.getTaskCheckpoints(taskId);
    if (taskCheckpoints.length === 0) return null;
    return taskCheckpoints[taskCheckpoints.length - 1]; // latest
  }

  /** Get all checkpoints for a task (sorted by timestamp) */
  getTaskCheckpoints(taskId: string): Checkpoint[] {
    const result: Checkpoint[] = [];
    for (const cp of this.checkpoints.values()) {
      if (cp.taskId === taskId) {
        result.push(cp);
      }
    }
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Clear all checkpoints for a task */
  clear(taskId: string): void {
    for (const key of [...this.checkpoints.keys()]) {
      if (key.startsWith(taskId + ":")) {
        this.checkpoints.delete(key);
      }
    }
  }

  /** Clear all checkpoints (for testing) */
  clearAll(): void {
    this.checkpoints.clear();
  }

  /** Count checkpoints for a task */
  count(taskId: string): number {
    return this.getTaskCheckpoints(taskId).length;
  }

  /** Mark nodes as completed in the plan (for resume) */
  static markCompleted(plan: ExecutionPlan, completedIds: string[]): ExecutionPlan {
    const completedSet = new Set(completedIds);
    const updatedNodes = plan.graph.nodes.map((node) => {
      if (completedSet.has(node.id)) {
        return {
          ...node,
          status: "done" as NodeStatus,
          completedAt: Date.now(),
        };
      }
      return node;
    });

    return {
      ...plan,
      graph: { ...plan.graph, nodes: updatedNodes },
    };
  }
}
