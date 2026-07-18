// CodeInsight AI — Autonomous Workflow Runner
// Prompt 12: Full pipeline Planner → Analysis → Architecture → Tasks → Code → Build → Test → Fix → Commit → Push → Report

import type { Task, TaskResult } from "@/lib/agents/types";
import type { AIProviderConfig } from "@/lib/agents/ai-client";
import { taskQueue } from "@/lib/agents/task-queue";
import { eventBus } from "@/lib/agents/event-bus";
import { contextRegistry } from "@/lib/agents/shared-context";
import { repositoryMemory } from "@/lib/agents/repository-memory";
import { registerAllAgents } from "@/lib/agents";
import { runAutonomousWorkflow as orchestratorRun } from "@/lib/agents/orchestrator";

export interface AutonomousWorkflowOptions {
  repositoryUrl?: string;
  provider?: AIProviderConfig;
  goal: string;
  /** If true, after completing tasks, attempt to build + test + commit + push. */
  autoCommit?: boolean;
  /** Max duration in ms. Default 10 minutes. */
  timeoutMs?: number;
  /** Called for every event emitted during the workflow. */
  onEvent?: (event: any) => void;
  /** Called with progress updates (0-100). */
  onProgress?: (progress: number, message: string) => void;
}

export interface AutonomousWorkflowResult {
  success: boolean;
  goal: string;
  graphId: string;
  tasksCompleted: number;
  tasksFailed: number;
  results: Record<string, TaskResult>;
  finalReport: string;
  artifacts: TaskResult["artifacts"];
  durationMs: number;
  events: any[];
  errors: string[];
}

/**
 * Run an autonomous workflow end-to-end.
 *
 * Pipeline:
 * 1. Planner breaks the goal into an ExecutionGraph
 * 2. Scheduler executes the graph (parallel where possible)
 * 3. Each node dispatches to a specialized agent (analyze/review/fix-bug/document/test/devops)
 * 4. Results aggregated, final report generated
 * 5. (Optional) Auto-commit changes
 *
 * Returns the full result + all events emitted.
 */
export async function runAutonomousWorkflow(
  options: AutonomousWorkflowOptions
): Promise<AutonomousWorkflowResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  // Ensure all agents are registered
  registerAllAgents();

  // Collect events for the result
  const events: any[] = [];
  const errors: string[] = [];
  const unsubscribe = eventBus.on("*", (event) => {
    events.push(event);
    if (event.type === "log" && event.level === "error") errors.push(event.message);
    if (options.onEvent) options.onEvent(event);
  });

  // Progress tracking — subscribe to task:progress events
  let lastProgress = 0;
  const unsubscribeProgress = eventBus.on("task:progress", (event) => {
    if (event.type !== "task:progress") return;
    if (event.progress > lastProgress) {
      lastProgress = event.progress;
      if (options.onProgress) options.onProgress(event.progress, event.message);
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (options.onProgress) options.onProgress(0, "Starting autonomous workflow");

  try {
    // Use the orchestrator to run the full pipeline
    const orchestratorResult = await orchestratorRun(
      options.goal,
      options.repositoryUrl,
      options.provider,
      { timeoutMs, onProgress: options.onProgress }
    );

    if (options.onProgress) options.onProgress(100, "Workflow complete");

    // Count tasks completed/failed from events
    const completed = events.filter(e => e.type === "task:completed").length;
    const failed = events.filter(e => e.type === "task:failed").length;

    // Build the final report
    const finalReport = buildFinalReport(options.goal, orchestratorResult, completed, failed, Date.now() - startTime);

    // Persist to repository memory
    if (options.repositoryUrl) {
      await repositoryMemory.remember(options.repositoryUrl, "lastWorkflow", {
        goal: options.goal,
        success: orchestratorResult.success,
        completed,
        failed,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      }, "decision");
    }

    return {
      success: orchestratorResult.success,
      goal: options.goal,
      graphId: (orchestratorResult.data as any)?.graphId ?? "unknown",
      tasksCompleted: completed,
      tasksFailed: failed,
      results: (orchestratorResult.data as any)?.results ?? {},
      finalReport,
      artifacts: orchestratorResult.artifacts ?? [],
      durationMs: Date.now() - startTime,
      events,
      errors,
    };
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
    return {
      success: false,
      goal: options.goal,
      graphId: "unknown",
      tasksCompleted: 0,
      tasksFailed: 0,
      results: {},
      finalReport: `Workflow failed: ${err?.message ?? String(err)}`,
      artifacts: [],
      durationMs: Date.now() - startTime,
      events,
      errors,
    };
  } finally {
    clearTimeout(timeoutId);
    unsubscribe();
    unsubscribeProgress();
  }
}

function buildFinalReport(
  goal: string,
  result: TaskResult,
  completed: number,
  failed: number,
  durationMs: number
): string {
  const lines: string[] = [
    `# Autonomous Workflow Report`,
    ``,
    `**Goal:** ${goal}`,
    `**Status:** ${result.success ? "✅ Success" : "❌ Failed"}`,
    `**Duration:** ${(durationMs / 1000).toFixed(1)}s`,
    `**Tasks completed:** ${completed}`,
    `**Tasks failed:** ${failed}`,
    ``,
    `## Summary`,
    ``,
    result.summary,
    ``,
  ];

  if (result.artifacts.length > 0) {
    lines.push(`## Artifacts`, ``);
    for (const a of result.artifacts) {
      lines.push(`- **${a.kind}**${a.path ? ` (${a.path})` : ""}: ${a.content.slice(0, 100)}${a.content.length > 100 ? "..." : ""}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Run a quick single-agent task (no full workflow, just one agent).
 * Useful for the AI Pair Programmer / chat-style interactions.
 */
export async function runSingleTask(
  kind: Task["kind"],
  input: Record<string, any>,
  options: { provider?: AIProviderConfig; timeoutMs?: number; onProgress?: (p: number, m: string) => void } = {}
): Promise<TaskResult> {
  registerAllAgents();

  const task = taskQueue.enqueue({
    kind,
    title: `Direct ${kind} task`,
    description: `Direct execution of ${kind}`,
    input,
    timeoutMs: options.timeoutMs ?? 120000,
  });

  return new Promise((resolve) => {
    let resolved = false;
    const unsub = eventBus.on("task:completed", (evt) => {
      if (evt.type !== "task:completed" || evt.task.id !== task.id) return;
      if (resolved) return;
      resolved = true;
      unsub();
      unsubFail();
      resolve(evt.task.output!);
    });
    const unsubFail = eventBus.on("task:failed", (evt) => {
      if (evt.type !== "task:failed" || evt.task.id !== task.id) return;
      if (resolved) return;
      resolved = true;
      unsub();
      unsubFail();
      resolve(evt.task.output ?? { success: false, data: null, summary: `Task failed: ${evt.error}`, artifacts: [] });
    });

    // Also forward progress
    if (options.onProgress) {
      const unsubProg = eventBus.on("task:progress", (evt) => {
        if (evt.type !== "task:progress" || evt.taskId !== task.id) return;
        options.onProgress!(evt.progress, evt.message);
      });
      // Clean up after 2x timeout
      setTimeout(unsubProg, (options.timeoutMs ?? 120000) * 2);
    }
  });
}

/**
 * AI Pair Programmer: given a natural-language request, plan + execute autonomously.
 * This is the entry point for chat-style "Add Google Login" → full implementation.
 */
export async function pairProgram(
  request: string,
  options: {
    repositoryUrl?: string;
    provider?: AIProviderConfig;
    onEvent?: (event: any) => void;
    onProgress?: (progress: number, message: string) => void;
  } = {}
): Promise<AutonomousWorkflowResult> {
  return runAutonomousWorkflow({
    goal: request,
    repositoryUrl: options.repositoryUrl,
    provider: options.provider,
    autoCommit: false,
    timeoutMs: 15 * 60 * 1000,  // 15 min for pair programming
    onEvent: options.onEvent,
    onProgress: options.onProgress,
  });
}
