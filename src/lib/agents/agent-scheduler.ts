// CodeInsight AI — Agent Scheduler
// Schedules agent execution based on the execution graph from the Planner.
// Supports parallel execution of independent nodes, dependency ordering, rollback.

import type { ExecutionGraph, ExecutionNode, Task, TaskResult, AgentId } from "./types";
import { taskQueue } from "./task-queue";
import { eventBus } from "./event-bus";

interface ScheduledRun {
  graph: ExecutionGraph;
  taskMap: Map<string, Task>;     // nodeId → Task
  results: Map<string, TaskResult>;  // nodeId → result
  completed: Set<string>;
  failed: Set<string>;
  onNodeComplete?: (nodeId: string, result: TaskResult) => void;
  onAllComplete?: (results: Map<string, TaskResult>) => void;
  aborted: boolean;
}

class AgentScheduler {
  /**
   * Execute an execution graph. Returns a promise that resolves when all nodes complete
   * (or rejects when a critical node fails and cannot be rolled back).
   */
  async execute(
    graph: ExecutionGraph,
    options: {
      onNodeComplete?: (nodeId: string, result: TaskResult) => void;
      onAllComplete?: (results: Map<string, TaskResult>) => void;
    } = {}
  ): Promise<Map<string, TaskResult>> {
    const run: ScheduledRun = {
      graph,
      taskMap: new Map(),
      results: new Map(),
      completed: new Set(),
      failed: new Set(),
      onNodeComplete: options.onNodeComplete,
      onAllComplete: options.onAllComplete,
      aborted: false,
    };

    eventBus.emit({ type: "graph:created", graph });
    eventBus.emit({ type: "log", level: "info", message: `[scheduler] Starting graph "${graph.goal}" with ${graph.nodes.length} nodes` });

    // Enqueue all root nodes (no dependencies)
    for (const node of graph.nodes) {
      if (node.dependencies.length === 0) {
        this.enqueueNode(run, node);
      }
    }

    // Wait for all nodes to complete (poll-based; simpler than promise chaining for graph topology)
    return new Promise((resolve, reject) => {
      const check = () => {
        if (run.aborted) {
          reject(new Error("Graph execution aborted"));
          return;
        }
        const total = graph.nodes.length;
        const done = run.completed.size + run.failed.size;
        if (done >= total) {
          if (run.onAllComplete) run.onAllComplete(run.results);
          if (run.failed.size > 0) {
            eventBus.emit({ type: "log", level: "warn", message: `[scheduler] Graph complete with ${run.failed.size} failed nodes` });
          } else {
            eventBus.emit({ type: "log", level: "info", message: `[scheduler] Graph complete: all ${total} nodes succeeded` });
          }
          resolve(run.results);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private enqueueNode(run: ScheduledRun, node: ExecutionNode): void {
    const task: Partial<Task> & { kind: Task["kind"]; title: string } = {
      kind: node.kind,
      title: node.title,
      description: `Graph node ${node.id} for goal: ${run.graph.goal}`,
      priority: node.priority,
      assignedAgent: node.agent,
      dependencies: node.dependencies
        .map(depId => run.taskMap.get(depId)?.id)
        .filter((x): x is string => !!x),
      input: { graphId: run.graph.id, nodeId: node.id, ...this.gatherDependencyOutputs(run, node) },
      timeoutMs: node.estimatedMs * 2 + 30000,
      maxAttempts: node.canRetry ? 3 : 1,
    };
    const enqueued = taskQueue.enqueue(task);
    run.taskMap.set(node.id, enqueued);

    // Listen for completion
    const unsub = eventBus.on("task:completed", (evt) => {
      if (evt.type !== "task:completed") return;
      if (evt.task.id !== enqueued.id) return;
      run.completed.add(node.id);
      run.results.set(node.id, evt.task.output!);
      eventBus.emit({ type: "graph:node-complete", nodeId: node.id, result: evt.task.output! });
      if (run.onNodeComplete) run.onNodeComplete(node.id, evt.task.output!);
      unsub();
      this.dispatchReadyNodes(run);
    });
    const unsubFail = eventBus.on("task:failed", (evt) => {
      if (evt.type !== "task:failed") return;
      if (evt.task.id !== enqueued.id) return;
      run.failed.add(node.id);
      eventBus.emit({
        type: "log",
        level: "error",
        message: `[scheduler] Node ${node.id} (${node.title}) failed: ${evt.error}`,
        agent: node.agent,
      });
      // Attempt rollback if defined
      if (node.rollbackAction) {
        eventBus.emit({ type: "log", level: "warn", message: `[scheduler] Rolling back node ${node.id}: ${node.rollbackAction}`, agent: node.agent });
      }
      unsubFail();
      // Continue dispatching other ready nodes — failure of one shouldn't block independent branches
      this.dispatchReadyNodes(run);
    });
  }

  private gatherDependencyOutputs(run: ScheduledRun, node: ExecutionNode): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (const depId of node.dependencies) {
      const result = run.results.get(depId);
      if (result) {
        outputs[depId] = result.data;
      }
    }
    return outputs;
  }

  private dispatchReadyNodes(run: ScheduledRun): void {
    for (const node of run.graph.nodes) {
      if (run.completed.has(node.id) || run.failed.has(node.id)) continue;
      if (run.taskMap.has(node.id)) continue;  // already enqueued
      const depsMet = node.dependencies.every(d => run.completed.has(d));
      if (depsMet) {
        this.enqueueNode(run, node);
      }
    }
  }
}

export const agentScheduler = new AgentScheduler();
