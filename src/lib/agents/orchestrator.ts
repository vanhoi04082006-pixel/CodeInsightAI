// CodeInsight AI — Orchestrator Agent
// Phase 3: Autonomous AI Software Engineer
//
// Receives a high-level user goal, calls the Planner to build an
// ExecutionGraph, then hands the graph to the agent-scheduler for
// parallel execution. Collects all node results and returns an
// aggregated summary.

import type {
  AgentCapability,
  AgentId,
  AgentInfo,
  ExecutionGraph,
  Task,
  TaskResult,
} from "./types";
import { BaseAgent } from "./base-agent";
import { taskQueue } from "./task-queue";
import { agentScheduler } from "./agent-scheduler";
import { contextRegistry } from "./shared-context";
import { eventBus } from "./event-bus";
import type { AIProviderConfig } from "./ai-client";

// ── Helpers ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 100;
const PLAN_TIMEOUT_MS = 5 * 60 * 1000; // 5 min cap on waiting for the planner

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface GraphSummary {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  nodeResults: { nodeId: string; title: string; success: boolean; summary: string }[];
}

function summarizeResults(graph: ExecutionGraph, results: Map<string, TaskResult>): GraphSummary {
  let succeeded = 0;
  let failed = 0;
  const nodeResults: GraphSummary["nodeResults"] = [];

  for (const node of graph.nodes) {
    const r = results.get(node.id);
    const success = !!r?.success;
    if (success) succeeded++;
    else failed++;
    nodeResults.push({
      nodeId: node.id,
      title: node.title,
      success,
      summary: r?.summary ?? "no result",
    });
  }

  return {
    total: graph.nodes.length,
    succeeded,
    failed,
    successRate: graph.nodes.length === 0 ? 0 : Math.round((succeeded / graph.nodes.length) * 100),
    nodeResults,
  };
}

// ── Orchestrator Agent ──────────────────────────────────────────────────────
class OrchestratorAgent extends BaseAgent {
  readonly id: AgentId = "orchestrator";
  readonly info: AgentInfo = {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Coordinates multi-agent execution",
    capabilities: [
      { kind: "custom", description: "Run an end-to-end autonomous workflow for a user goal" },
    ] as AgentCapability[],
    icon: "Network",
    color: "#22d3ee",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = task.input ?? {};
    if (input.action !== "orchestrate") {
      return {
        success: false,
        data: null,
        summary: "Orchestrator: task.input.action must equal 'orchestrate'",
        artifacts: [],
      };
    }
    const goal: string = typeof input.goal === "string" ? input.goal : "";
    const repositoryUrl: string | undefined =
      typeof input.repositoryUrl === "string" ? input.repositoryUrl : undefined;
    const provider: AIProviderConfig | undefined = input.provider as AIProviderConfig | undefined;

    if (!goal) {
      return {
        success: false,
        data: null,
        summary: "Orchestrator: no goal provided in task.input.goal",
        artifacts: [],
      };
    }

    this.log("info", `Orchestrating workflow for goal: "${goal}"`);
    contextRegistry.recordEvent(task.id, this.id, "orchestration-start", `Started orchestration for goal: ${goal}`, "info", {
      repositoryUrl,
      hasProvider: !!provider,
    });

    // ── Step 1: Ask the Planner to build a graph ───────────────────────────
    onProgress(10, "Delegating to Planner");
    const planResult = await this.callPlanner(task.id, goal, repositoryUrl, provider, signal, onProgress);
    if (signal.aborted) return this.cancelledResult(task.id, goal);

    if (!planResult.success || !planResult.data) {
      const err = planResult.summary || "Planner did not produce a graph";
      this.log("error", `Planner failed: ${err}`);
      contextRegistry.recordEvent(task.id, this.id, "planner-failed", err, "error");
      return {
        success: false,
        data: null,
        summary: `Orchestrator aborted: planner failed — ${err}`,
        artifacts: planResult.artifacts ?? [],
      };
    }

    const graph = planResult.data as ExecutionGraph;
    this.log("info", `Planner produced graph with ${graph.nodes.length} nodes`);
    contextRegistry.setMemory(task.id, "executionGraph", graph);

    // ── Step 2: Graph ready ────────────────────────────────────────────────
    onProgress(30, `Execution graph ready (${graph.nodes.length} tasks)`);

    // ── Step 3: Schedule & run ─────────────────────────────────────────────
    onProgress(40, "Scheduling tasks for parallel execution");

    let results: Map<string, TaskResult>;
    try {
      results = await this.runGraphWithProgress(task.id, graph, signal, onProgress);
    } catch (err: unknown) {
      if (signal.aborted) return this.cancelledResult(task.id, goal);
      const msg = err instanceof Error ? err.message : String(err);
      this.log("error", `Graph execution failed: ${msg}`);
      contextRegistry.recordEvent(task.id, this.id, "graph-failed", msg, "error");
      return {
        success: false,
        data: null,
        summary: `Orchestrator failed during graph execution: ${msg}`,
        artifacts: [],
      };
    }

    if (signal.aborted) return this.cancelledResult(task.id, goal);

    // ── Step 4: Summarise ──────────────────────────────────────────────────
    onProgress(90, "Aggregating results");
    const summary = summarizeResults(graph, results);
    const success = summary.failed === 0;
    const level = success ? "info" : summary.successRate >= 50 ? "warn" : "error";

    this.log(level, `Workflow finished: ${summary.succeeded}/${summary.total} succeeded`);
    contextRegistry.recordEvent(
      task.id,
      this.id,
      "orchestration-complete",
      `Workflow complete — ${summary.succeeded}/${summary.total} tasks succeeded (${summary.successRate}%)`,
      level,
      summary,
    );

    // ── Step 5: Return aggregated result ───────────────────────────────────
    onProgress(100, success ? "All tasks succeeded" : `${summary.failed} task(s) failed`);

    const reportLines: string[] = [
      `# Autonomous Workflow Report`,
      ``,
      `**Goal:** ${goal}`,
      `**Repository:** ${repositoryUrl ?? "(none)"}`,
      `**Tasks:** ${summary.total} total — ${summary.succeeded} succeeded, ${summary.failed} failed`,
      `**Success rate:** ${summary.successRate}%`,
      ``,
      `## Task Results`,
      ``,
    ];
    for (const nr of summary.nodeResults) {
      const icon = nr.success ? "[OK]" : "[FAIL]";
      reportLines.push(`- ${icon} \`${nr.nodeId}\` — ${nr.title} — ${nr.summary}`);
    }

    return {
      success,
      data: {
        graph,
        summary,
        results: Array.from(results.entries()).map(([nodeId, r]) => ({ nodeId, ...r })),
      },
      summary: success
        ? `Workflow succeeded: all ${summary.total} tasks completed for goal: ${goal}`
        : `Workflow partially failed: ${summary.succeeded}/${summary.total} tasks succeeded for goal: ${goal}`,
      artifacts: [
        {
          kind: "report",
          content: reportLines.join("\n"),
          language: "markdown",
          meta: {
            totalTasks: summary.total,
            succeeded: summary.succeeded,
            failed: summary.failed,
            successRate: summary.successRate,
          },
        },
      ],
      metrics: {
        totalTasks: summary.total,
        succeeded: summary.succeeded,
        failed: summary.failed,
        successRate: summary.successRate,
        estimatedDurationMs: graph.estimatedDurationMs,
      },
    };
  }

  /** Enqueue a "plan" task and poll the queue until it finishes. */
  private async callPlanner(
    orchestratorTaskId: string,
    goal: string,
    repositoryUrl: string | undefined,
    provider: AIProviderConfig | undefined,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const planTask = taskQueue.enqueue({
      kind: "plan",
      title: `Plan: ${goal.slice(0, 80)}`,
      description: `Planner task spawned by orchestrator ${orchestratorTaskId}`,
      priority: "high",
      assignedAgent: "planner",
      input: { goal, repositoryUrl, provider, orchestratorTaskId },
      maxAttempts: 2,
      timeoutMs: PLAN_TIMEOUT_MS,
    });

    this.log("info", `Enqueued plan task ${planTask.id}`);
    contextRegistry.recordEvent(orchestratorTaskId, this.id, "planner-delegated", `Delegated to planner (task ${planTask.id})`, "info");

    // Poll for completion, listening for abort.
    const start = Date.now();
    while (true) {
      if (signal.aborted) {
        taskQueue.cancel(planTask.id);
        throw new Error("Aborted");
      }
      const t = taskQueue.get(planTask.id);
      if (!t) {
        // Shouldn't happen — task was enqueued.
        return {
          success: false,
          data: null,
          summary: "Planner task disappeared from queue",
          artifacts: [],
        };
      }
      if (t.status === "completed" || t.status === "failed" || t.status === "cancelled") {
        if (t.output) return t.output;
        if (t.status === "cancelled") {
          return { success: false, data: null, summary: "Planner task cancelled", artifacts: [] };
        }
        return {
          success: false,
          data: null,
          summary: t.error ?? "Planner task failed without output",
          artifacts: [],
        };
      }
      // Update sub-progress in the 10-30% band.
      const elapsed = Date.now() - start;
      const subPct = Math.min(28, 10 + Math.floor((elapsed / PLAN_TIMEOUT_MS) * 18));
      onProgress(subPct, `Waiting for planner (status: ${t.status})`);
      try {
        await sleep(POLL_INTERVAL_MS, signal);
      } catch {
        taskQueue.cancel(planTask.id);
        throw new Error("Aborted");
      }
    }
  }

  /** Run the graph via the scheduler, also forwarding periodic progress. */
  private async runGraphWithProgress(
    orchestratorTaskId: string,
    graph: ExecutionGraph,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<Map<string, TaskResult>> {
    let completed = 0;
    const total = graph.nodes.length;

    const unsubComplete = eventBus.on("graph:node-complete", (evt) => {
      if (evt.type !== "graph:node-complete") return;
      completed++;
      const pct = 40 + Math.floor((completed / Math.max(1, total)) * 45);
      onProgress(pct, `Node ${evt.nodeId} complete (${completed}/${total})`);
    });

    const onAbort = () => {
      // Cancel every task that belongs to this graph.
      for (const t of taskQueue.getAll()) {
        if (t.input?.graphId === graph.id && (t.status === "pending" || t.status === "queued" || t.status === "running")) {
          taskQueue.cancel(t.id);
        }
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      const results = await agentScheduler.execute(graph);
      return results;
    } finally {
      unsubComplete();
      signal.removeEventListener("abort", onAbort);
      contextRegistry.recordEvent(
        orchestratorTaskId,
        this.id,
        "graph-executed",
        `Graph executed (${completed}/${total} observed completions)`,
        "info",
      );
    }
  }

  private cancelledResult(orchestratorTaskId: string, goal: string): TaskResult {
    this.log("warn", "Orchestration cancelled by signal");
    contextRegistry.recordEvent(orchestratorTaskId, this.id, "orchestration-cancelled", "Workflow cancelled", "warn");
    return {
      success: false,
      data: null,
      summary: `Orchestration cancelled for goal: ${goal}`,
      artifacts: [],
    };
  }
}

export const orchestratorAgent = new OrchestratorAgent();
export { OrchestratorAgent };

// ── Convenience entry-point ─────────────────────────────────────────────────
/**
 * Build an orchestration task for `goal` and run it to completion.
 * Returns the final TaskResult (which contains the graph + aggregated
 * per-node results).
 */
export async function runAutonomousWorkflow(
  goal: string,
  repositoryUrl?: string,
  provider?: AIProviderConfig,
  options: { timeoutMs?: number; onProgress?: (p: number, msg: string) => void } = {},
): Promise<TaskResult> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const task: Task = {
    id: `task_orchestrate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "custom",
    title: `Orchestrate: ${goal.slice(0, 80)}`,
    description: "Top-level autonomous workflow",
    priority: "critical",
    status: "running",
    assignedAgent: "orchestrator",
    dependencies: [],
    input: { action: "orchestrate", goal, repositoryUrl, provider },
    createdAt: Date.now(),
    startedAt: Date.now(),
    attempts: 1,
    maxAttempts: 1,
    timeoutMs,
    progress: 0,
    subtaskIds: [],
  };

  try {
    return await orchestratorAgent.run(task, controller.signal, options.onProgress);
  } finally {
    clearTimeout(timer);
  }
}
