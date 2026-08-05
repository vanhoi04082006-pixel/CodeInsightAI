// CodeInsight AI — Execution Engine (Layer 7)
// DAG executor: runs nodes in dependency order, supports parallel groups,
// handles timeout, retry, and permission gates.
//
// v2.0 — SINGLE EVENT CHANNEL: ALL events (node.*, permission.*) are yielded
// through the async generator. The EventBus is kept only for internal
// logging/metrics and is NOT subscribed to by the SSE route. This fixes the
// v1 bug where 6 critical event types (node.started/completed/failed +
// permission.requested/granted/denied) were emitted via eventBus.emit() and
// never reached the SSE client.

import type {
  ExecutionPlan,
  ExecutionGraph,
  PlanNode,
  NodeStatus,
  AgentContext,
  AgentEvent,
  Tool,
  Result,
  ChangeRecord,
} from "../contracts";
import type { EventBusImpl } from "./event-bus";
import { makeEvent } from "./event-bus";
import type { PermissionGateImpl } from "./permission-gate";
import type { CheckpointManager } from "./checkpoint-manager";
import type { RollbackManager } from "./rollback-manager";
import { registerRollbackManager, unregisterRollbackManager } from "./shared-state";

interface ExecutionEngineConfig {
  eventBus: EventBusImpl;
  permissionGate: PermissionGateImpl;
  checkpointManager: CheckpointManager;
  rollbackManager: RollbackManager;
  toolRegistry: { get: (name: string) => Tool | null };
}

/** Outcome of executing a single node — surfaced via the generator's return value. */
type NodeOutcome = "done" | "failed" | "skipped";

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
   * Yields ALL events as they occur — node.*, permission.*, task.*, etc.
   */
  async *execute(
    plan: ExecutionPlan,
    context: AgentContext,
  ): AsyncGenerator<AgentEvent> {
    const { graph, policy } = plan;
    const completed = new Set<string>();
    const failed = new Set<string>();

    // v2.0: Wire the RollbackManager with real file operations and register
    // it in shared-state so tools (rollback-changes) can access it.
    await this.wireRollbackManager(context);
    registerRollbackManager(context.analysisId, this.config.rollbackManager);

    try {
      yield* this.executePlan(plan, context, completed, failed);
    } finally {
      // Always unregister, even on exception/cancellation.
      unregisterRollbackManager(context.analysisId);
    }
  }

  /** Inner execution loop (extracted so the finally unregister always runs). */
  private async *executePlan(
    plan: ExecutionPlan,
    context: AgentContext,
    completed: Set<string>,
    failed: Set<string>,
  ): AsyncGenerator<AgentEvent> {
    const { graph, policy } = plan;

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
        // No ready nodes but not all done — deadlock or all remaining are failed.
        // Emit node.skipped for any pending nodes whose deps failed (so UI knows).
        for (const node of graph.nodes) {
          if (node.status === "pending" && !completed.has(node.id) && !failed.has(node.id)) {
            const depFailed = node.dependsOn.some((d) => failed.has(d));
            if (depFailed) {
              yield makeEvent({
                type: "node.skipped",
                nodeId: node.id,
                reason: "Dependency failed",
              });
              completed.add(node.id);
            }
          }
        }
        break;
      }

      // Group by parallelGroup (or run sequentially if no group)
      const groups = this.groupByParallel(readyNodes);

      for (const group of groups) {
        // Limit to maxParallel
        const batch = group.slice(0, policy.maxParallel);

        // v2.2 fix (C6): concurrent event queue — events stream LIVE as nodes
        // produce them, instead of being buffered until the whole batch completes.
        const queue: AgentEvent[] = [];
        let resolveWait: (() => void) | null = null;
        const push = (ev: AgentEvent) => {
          queue.push(ev);
          if (resolveWait) { resolveWait(); resolveWait = null; }
        };
        const waitForEvent = () => new Promise<boolean>((resolve) => {
          if (queue.length > 0) return resolve(true);
          resolveWait = () => resolve(true);
        });

        // Start all nodes in parallel — each pushes events to the queue.
        const outcomes: NodeOutcome[] = new Array(batch.length);
        const done = Promise.all(
          batch.map(async (node, i) => {
            outcomes[i] = await this.drainNodeLive(node, plan, context, push);
          }),
        );
        let doneFlag = false;
        const donePromise = done.then(() => { doneFlag = true; if (resolveWait) { resolveWait(); resolveWait = null; } });

        // Yield events as they arrive, until all nodes complete.
        while (!doneFlag) {
          await Promise.race([donePromise, waitForEvent()]);
          while (queue.length > 0) {
            yield queue.shift()!;
          }
        }
        await donePromise; // ensure all outcomes captured
        while (queue.length > 0) {
          yield queue.shift()!;
        }

        // Process outcomes
        for (let i = 0; i < batch.length; i++) {
          const node = batch[i];
          const outcome = outcomes[i];

          if (outcome === "done") {
            completed.add(node.id);
            this.config.checkpointManager.save(
              this.taskId,
              plan,
              [...completed],
              node.id,
              context.memory?.working,
            );
            yield makeEvent({ type: "checkpoint.saved", taskId: this.taskId, nodeId: node.id });
          } else if (outcome === "failed") {
            failed.add(node.id);
            if (!policy.continueOnFailure) {
              // Rollback if enabled
              if (policy.rollbackOnFailure && this.config.rollbackManager.hasChanges()) {
                const rb = await this.config.rollbackManager.rollback();
                if (!rb.ok) {
                  yield makeEvent({
                    type: "task.failed",
                    error: {
                      code: "RUNTIME_ROLLBACK_FAILED",
                      message: `Rollback failed: ${rb.error.message}`,
                      recoverable: false,
                    },
                  });
                  return;
                }
              }
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
          } else if (outcome === "skipped") {
            completed.add(node.id);
            // v2.2: executeNodeGen yields permission.requested/denied but does NOT yield
            // node.skipped for permission denials (it returns "skipped" instead).
            // Yield node.skipped here so the UI knows the node was skipped.
            yield makeEvent({ type: "node.skipped", nodeId: node.id, reason: "Permission denied or dependency failed" });
          }
        }
      }
    }

    // Emit completion or failure
    if (failed.size > 0 && !policy.continueOnFailure) {
      // (rollback already handled above when the first failure triggered return)
      yield makeEvent({
        type: "task.failed",
        error: {
          code: "PLAN_FAILED",
          message: `${failed.size} nodes failed`,
          recoverable: false,
        },
      });
    } else if (failed.size > 0 && policy.rollbackOnFailure && this.config.rollbackManager.hasChanges()) {
      // continueOnFailure=true but some failed — still rollback if configured
      const rb = await this.config.rollbackManager.rollback();
      if (!rb.ok) {
        yield makeEvent({
          type: "task.failed",
          error: {
            code: "RUNTIME_ROLLBACK_FAILED",
            message: `Rollback failed: ${rb.error.message}`,
            recoverable: false,
          },
        });
        return;
      }
      yield makeEvent({
        type: "patch.rolledback",
        nodeId: "",
        file: "",
      });
      const completedCount = completed.size;
      const total = graph.nodes.length;
      yield makeEvent({
        type: "task.completed",
        summary: `Completed ${completedCount}/${total} steps (${failed.size} failed, rolled back)`,
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

  /**
   * Execute a single node, pushing all emitted events to the `push` callback.
   * Returns the outcome ("done" | "failed" | "skipped").
   * v2.2 (C6 fix): pushes events LIVE via callback instead of buffering.
   */
  private async drainNodeLive(
    node: PlanNode,
    plan: ExecutionPlan,
    context: AgentContext,
    push: (ev: AgentEvent) => void,
  ): Promise<NodeOutcome> {
    const gen = this.executeNodeGen(node, plan, context);
    let outcome: NodeOutcome = "failed";
    while (true) {
      const result = await gen.next();
      if (result.done) {
        outcome = result.value;
        break;
      }
      push(result.value);
    }
    return outcome;
  }

  /**
   * Execute a single node as an async generator.
   * Yields: node.started, node.completed, node.failed, permission.requested,
   *         permission.granted, permission.denied.
   * Returns: "done" | "failed" | "skipped".
   *
   * v2.0: ALL events are yielded here (not emitted via eventBus.emit), so they
   * flow through the single SSE channel to the UI.
   */
  private async *executeNodeGen(
    node: PlanNode,
    plan: ExecutionPlan,
    context: AgentContext,
  ): AsyncGenerator<AgentEvent, NodeOutcome> {
    const { policy } = plan;
    const nodePolicy = node.nodePolicy
      ? { ...policy, ...node.nodePolicy }
      : policy;

    // Update node status
    node.status = "running" as NodeStatus;
    node.startedAt = Date.now();

    // Update working memory: current step / current tool / current file (from params).
    this.updateWorkingMemory(context, { currentStep: node.step });

    // Get tool
    const toolName = node.toolName || node.capability;
    const tool = this.config.toolRegistry.get(toolName);
    if (!tool) {
      const error = {
        code: "TOOL_NOT_FOUND",
        message: `Tool not found: ${toolName}`,
        recoverable: false,
      };
      node.status = "failed" as NodeStatus;
      node.error = error;
      yield makeEvent({ type: "node.failed", nodeId: node.id, error });
      return "failed";
    }

    // Check permission
    const manifest = tool.manifest;
    // v2.1 security fix: "deny" level tools NEVER execute (bypassed in v2.0
    // because requireConfirmationFor only included "prompt").
    if (manifest.permission === "deny") {
      node.status = "skipped" as NodeStatus;
      yield makeEvent({
        type: "node.skipped",
        nodeId: node.id,
        reason: "Tool permission is 'deny' — execution blocked",
      });
      return "skipped";
    }

    // Stage 5.2: Autonomous mode — check SessionMemory preferences.
    // If autoApproveWriteTools is true, skip the permission prompt for
    // write tools (permission="prompt"). Read tools (permission="allow")
    // are always auto-approved. This enables autonomous coding without
    // manual approval for each file modification.
    const autoApproveWrites = context.memory?.session?.preferences?.autoApproveWriteTools === true;
    const needsPermission = !autoApproveWrites && nodePolicy.requireConfirmationFor.includes(manifest.permission);

    if (needsPermission) {
      // Yield permission.requested (NOT eventBus.emit) — UI sees it via SSE.
      yield makeEvent({
        type: "permission.requested",
        nodeId: node.id,
        tool: toolName,
        params: node.params,
        diff: undefined,
      });

      // Await user response (with timeout to prevent infinite hang).
      // PermissionGate.request no longer emits events; it just resolves the Promise.
      const granted = await this.config.permissionGate.request(
        node.id,
        toolName,
        node.params,
        manifest,
      );

      if (granted) {
        yield makeEvent({ type: "permission.granted", nodeId: node.id });
      } else {
        yield makeEvent({
          type: "permission.denied",
          nodeId: node.id,
          reason: "Denied by user",
        });
        node.status = "skipped" as NodeStatus;
        return "skipped";
      }
    }

    // Emit node.started (yielded, not emitted)
    yield makeEvent({
      type: "node.started",
      nodeId: node.id,
      tool: toolName,
    });

    // Also emit via eventBus for internal logging (no subscribers in production,
    // but keeps the logging contract for tests/dev tools).
    this.config.eventBus.emit(makeEvent({
      type: "node.started",
      nodeId: node.id,
      tool: toolName,
    }));

    // Execute with timeout + retry
    let lastError: { code: string; message: string; recoverable: boolean } | null = null;
    const maxRetries = nodePolicy.defaultRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutMs = nodePolicy.defaultTimeout;
        const result = await this.executeWithTimeout(tool, node.params, context, timeoutMs);

        if (result.ok) {
          node.status = "done" as NodeStatus;
          node.result = result.value;
          node.completedAt = Date.now();

          // v2.0: Track file changes from write-tool results in the RollbackManager.
          this.trackChangesFromResult(result.value);

          // v2.0: Update working memory with file info from the tool result
          // (so the UI's WorkingMemoryPanel reflects real progress).
          this.updateWorkingMemoryFromResult(context, node, result.value);

          // Log execution to task memory
          this.logExecution(context, node, toolName, result.value, node.completedAt - (node.startedAt ?? node.completedAt));

          yield makeEvent({
            type: "node.completed",
            nodeId: node.id,
            result: result.value,
          });

          this.config.eventBus.emit(makeEvent({
            type: "node.completed",
            nodeId: node.id,
            result: result.value,
          }));

          return "done";
        } else {
          lastError = {
            code: result.error.code,
            message: result.error.message,
            recoverable: result.error.recoverable,
          };
          if (!result.error.recoverable) break;
        }
      } catch (e) {
        lastError = {
          code: "TOOL_EXECUTION_FAILED",
          message: e instanceof Error ? e.message : String(e),
          recoverable: true,
        };
      }
    }

    // All retries failed
    node.status = "failed" as NodeStatus;
    node.error = {
      code: lastError?.code || "TOOL_EXECUTION_FAILED",
      message: lastError?.message || "Unknown error",
      recoverable: false,
    };

    yield makeEvent({
      type: "node.failed",
      nodeId: node.id,
      error: node.error,
    });

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

  /** Update working memory and emit memory.updated event (via EventBus for logging) */
  private updateWorkingMemory(context: AgentContext, patch: Partial<{ currentStep: string | null; currentFile: string | null; currentFunction: string | null; currentSymbol: string | null; currentHypothesis: string | null }>): void {
    const working = context.memory?.working;
    if (!working) return;
    working.update(patch);
  }

  /**
   * Update working memory with file/symbol info extracted from a tool result.
   * The apply-patch tool returns { modifiedFiles: [...] }, search-code returns
   * files, find-symbol returns symbols. We surface the first file/symbol so
   * the UI's WorkingMemoryPanel shows what the agent is working on.
   */
  private updateWorkingMemoryFromResult(context: AgentContext, node: PlanNode, result: unknown): void {
    const working = context.memory?.working;
    if (!working || !result || typeof result !== "object") return;
    const r = result as { modifiedFiles?: string[]; files?: string[]; file?: string; symbols?: Array<{ name?: string; file?: string }>; symbol?: string; diff?: string };
    const patch: Partial<{ currentFile: string | null; currentSymbol: string | null; currentHypothesis: string | null }> = {};
    if (Array.isArray(r.modifiedFiles) && r.modifiedFiles.length > 0) {
      patch.currentFile = r.modifiedFiles[0];
    } else if (Array.isArray(r.files) && r.files.length > 0) {
      patch.currentFile = typeof r.files[0] === "string" ? r.files[0] : (r.files[0] as any)?.path || null;
    } else if (typeof r.file === "string") {
      patch.currentFile = r.file;
    }
    if (Array.isArray(r.symbols) && r.symbols.length > 0 && r.symbols[0]?.name) {
      patch.currentSymbol = r.symbols[0].name!;
    }
    if (patch.currentFile || patch.currentSymbol) {
      working.update(patch);
    }
  }

  /**
   * Wire the runtime's RollbackManager with real file operations (v2.0 fix).
   * v1 left fileOps=null → hasChanges() always false → rollback never worked.
   */
  private async wireRollbackManager(_context: AgentContext): Promise<void> {
    try {
      const fileOps = await import("@/lib/repo-editor/file-operations");
      this.config.rollbackManager.setFileOps({
        deleteFile: fileOps.deleteFile,
        writeFile: fileOps.writeFile,
        createFile: fileOps.createFile,
        fileExists: fileOps.fileExists,
      });
    } catch {
      // File ops unavailable (e.g. in test environment) — rollback will be a no-op.
    }
  }

  /**
   * Track file changes from a tool's result in the runtime's RollbackManager.
   * The apply-patch tool returns { changes: ChangeRecord[] } — we track those
   * so rollback-on-failure and the rollback-changes tool can restore files.
   */
  private trackChangesFromResult(result: unknown): void {
    if (!result || typeof result !== "object") return;
    const r = result as { changes?: ChangeRecord[] };
    if (!Array.isArray(r.changes) || r.changes.length === 0) return;
    try {
      this.config.rollbackManager.trackAll(r.changes);
    } catch {
      // best-effort
    }
  }

  /** Log an execution entry to task memory (best-effort, never throws) */
  private logExecution(context: AgentContext, node: PlanNode, tool: string, result: unknown, duration: number): void {
    const task = context.memory?.task as any;
    if (!task || typeof task.addLogEntry !== "function") return;
    try {
      task.addLogEntry({
        nodeId: node.id,
        tool,
        params: node.params,
        result,
        duration,
        timestamp: Date.now(),
      });
    } catch {
      // best-effort — logging must never break execution
    }
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
