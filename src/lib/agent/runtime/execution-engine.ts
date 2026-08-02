// CodeInsight AI — Execution Engine (Layer 7)
// DAG executor: runs nodes in dependency order, supports parallel groups,
// handles timeout, retry, and permission gates.

import type {
  ExecutionPlan,
  ExecutionGraph,
  PlanNode,
  NodeStatus,
  AgentContext,
  AgentEvent,
  Tool,
  Result,
} from "../contracts";
import type { EventBusImpl } from "./event-bus";
import { makeEvent } from "./event-bus";
import type { PermissionGateImpl } from "./permission-gate";
import type { CheckpointManager } from "./checkpoint-manager";
import type { RollbackManager } from "./rollback-manager";

interface ExecutionEngineConfig {
  eventBus: EventBusImpl;
  permissionGate: PermissionGateImpl;
  checkpointManager: CheckpointManager;
  rollbackManager: RollbackManager;
  toolRegistry: { get: (name: string) => Tool | null };
}

export class ExecutionEngine {
  private cancelled = false;
  private paused = false;
  private taskId: string;

  constructor(
    taskId: string,
    private readonly config: ExecutionEngineConfig,
  ) {
    this.taskId = taskId;
  }

  /**
   * Execute a plan's DAG.
   * Yields events as they occur.
   */
  async *execute(
    plan: ExecutionPlan,
    context: AgentContext,
  ): AsyncGenerator<AgentEvent> {
    const { graph, policy } = plan;
    const completed = new Set<string>();
    const failed = new Set<string>();

    // Emit plan.generated
    yield makeEvent({ type: "plan.generated", plan });

    // Process nodes in waves (topological order)
    while (completed.size + failed.size < graph.nodes.length) {
      if (this.cancelled) {
        yield makeEvent({ type: "task.cancelled", reason: "User cancelled" });
        return;
      }

      if (this.paused) {
        // Save checkpoint and wait
        this.config.checkpointManager.save(
          this.taskId,
          plan,
          [...completed],
          null,
          context.memory?.working,
        );
        yield makeEvent({ type: "task.paused", nodeId: "" });
        return;
      }

      // Get ready nodes (deps satisfied, not yet completed/failed)
      const readyNodes = this.getReadyNodes(graph, completed, failed);

      if (readyNodes.length === 0) {
        // No ready nodes but not all done — deadlock or all remaining are failed
        break;
      }

      // Group by parallelGroup (or run sequentially if no group)
      const groups = this.groupByParallel(readyNodes);

      for (const group of groups) {
        // Limit to maxParallel
        const batch = group.slice(0, policy.maxParallel);

        // Execute batch in parallel
        const results = await Promise.allSettled(
          batch.map((node) => this.executeNode(node, plan, context)),
        );

        for (let i = 0; i < batch.length; i++) {
          const node = batch[i];
          const result = results[i];

          if (result.status === "fulfilled") {
            if (result.value === "done") {
              completed.add(node.id);
              // Save checkpoint
              this.config.checkpointManager.save(
                this.taskId,
                plan,
                [...completed],
                node.id,
                context.memory?.working,
              );
              yield makeEvent({ type: "checkpoint.saved", taskId: this.taskId, nodeId: node.id });
            } else if (result.value === "failed") {
              failed.add(node.id);
              if (!policy.continueOnFailure) {
                // Stop on first failure
                yield makeEvent({
                  type: "task.failed",
                  error: {
                    code: "NODE_FAILED",
                    message: `Node "${node.id}" failed and continueOnFailure=false`,
                    recoverable: false,
                  },
                });
                return;
              }
            } else if (result.value === "skipped") {
              completed.add(node.id);
              yield makeEvent({ type: "node.skipped", nodeId: node.id, reason: "Permission denied" });
            }
          } else {
            failed.add(node.id);
          }
        }
      }
    }

    // Emit completion or failure
    if (failed.size > 0 && !policy.continueOnFailure) {
      // Rollback if enabled
      if (policy.rollbackOnFailure && this.config.rollbackManager.hasChanges()) {
        await this.config.rollbackManager.rollback();
      }
      yield makeEvent({
        type: "task.failed",
        error: {
          code: "PLAN_FAILED",
          message: `${failed.size} nodes failed`,
          recoverable: false,
        },
      });
    } else {
      const completedCount = completed.size;
      const total = graph.nodes.length;
      yield makeEvent({
        type: "task.completed",
        summary: `Completed ${completedCount}/${total} steps`,
      });
    }
  }

  /** Execute a single node */
  private async executeNode(
    node: PlanNode,
    plan: ExecutionPlan,
    context: AgentContext,
  ): Promise<"done" | "failed" | "skipped"> {
    const { policy } = plan;
    const nodePolicy = node.nodePolicy
      ? { ...policy, ...node.nodePolicy }
      : policy;

    // Update node status
    node.status = "running" as NodeStatus;
    node.startedAt = Date.now();

    // Get tool
    const toolName = node.toolName || node.capability;
    const tool = this.config.toolRegistry.get(toolName);
    if (!tool) {
      this.config.eventBus.emit(makeEvent({
        type: "node.failed",
        nodeId: node.id,
        error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${toolName}`, recoverable: false },
      }));
      return "failed";
    }

    // Check permission
    const manifest = tool.manifest;
    const needsPermission = nodePolicy.requireConfirmationFor.includes(manifest.permission);

    if (needsPermission) {
      const granted = await this.config.permissionGate.request(
        node.id,
        toolName,
        node.params,
        manifest,
      );

      if (!granted) {
        return "skipped";
      }
    }

    // Emit node.started
    this.config.eventBus.emit(makeEvent({
      type: "node.started",
      nodeId: node.id,
      tool: toolName,
    }));

    // Execute with timeout + retry
    let lastError: any = null;
    const maxRetries = nodePolicy.defaultRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutMs = nodePolicy.defaultTimeout;
        const result = await this.executeWithTimeout(tool, node.params, context, timeoutMs);

        if (result.ok) {
          node.status = "done" as NodeStatus;
          node.result = result.value;
          node.completedAt = Date.now();

          this.config.eventBus.emit(makeEvent({
            type: "node.completed",
            nodeId: node.id,
            result: result.value,
          }));

          return "done";
        } else {
          lastError = result.error;
          if (!result.error.recoverable) break;
        }
      } catch (e) {
        lastError = e;
      }
    }

    // All retries failed
    node.status = "failed" as NodeStatus;
    node.error = {
      code: "TOOL_EXECUTION_FAILED",
      message: lastError?.message || String(lastError),
      recoverable: false,
    };

    this.config.eventBus.emit(makeEvent({
      type: "node.failed",
      nodeId: node.id,
      error: node.error,
    }));

    return "failed";
  }

  /** Execute tool with timeout */
  private async executeWithTimeout(
    tool: Tool,
    params: Record<string, unknown>,
    context: AgentContext,
    timeoutMs: number,
  ): Promise<Result<unknown>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          ok: false,
          error: {
            code: "TOOL_TIMEOUT",
            message: `Tool timed out after ${timeoutMs}ms`,
            recoverable: true,
          },
        });
      }, timeoutMs);

      tool.execute(params, context).then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((e) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: {
            code: "TOOL_EXECUTION_FAILED",
            message: e instanceof Error ? e.message : String(e),
            recoverable: true,
          },
        });
      });
    });
  }

  /** Get nodes ready to execute (deps satisfied, not done/failed) */
  private getReadyNodes(
    graph: ExecutionGraph,
    completed: Set<string>,
    failed: Set<string>,
  ): PlanNode[] {
    return graph.nodes.filter((node) => {
      if (node.status !== "pending") return false;
      if (completed.has(node.id) || failed.has(node.id)) return false;
      // All deps must be completed (not failed)
      return node.dependsOn.every((dep) => completed.has(dep));
    });
  }

  /** Group nodes by parallelGroup (nodes without group are each their own group) */
  private groupByParallel(nodes: PlanNode[]): PlanNode[][] {
    const groups = new Map<string, PlanNode[]>();

    for (const node of nodes) {
      const groupKey = node.parallelGroup ?? node.id; // no group = own group
      const arr = groups.get(groupKey) ?? [];
      arr.push(node);
      groups.set(groupKey, arr);
    }

    return [...groups.values()];
  }

  /** Cancel execution */
  cancel(): void {
    this.cancelled = true;
    this.config.permissionGate.cancelAll();
  }

  /** Pause execution */
  pause(): void {
    this.paused = true;
  }

  /** Resume execution */
  resume(): void {
    this.paused = false;
  }
}
