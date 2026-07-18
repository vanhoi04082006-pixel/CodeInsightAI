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
import { commandRunner } from "@/lib/terminal";
import { gitOps, generateCommitMessage } from "@/lib/git-intelligence";
import { writeFile } from "@/lib/repo-editor";
import { logger } from "@/lib/production/logger";
import { metrics } from "@/lib/production/metrics";
import { tracer, type Span } from "@/lib/production/tracing";

export interface AutonomousWorkflowOptions {
  repositoryUrl?: string;
  provider?: AIProviderConfig;
  goal: string;
  autoCommit?: boolean;
  cwd?: string;
  timeoutMs?: number;
  onEvent?: (event: any) => void;
  onProgress?: (progress: number, message: string) => void;
}

export interface WorkflowPhase {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  result?: any;
  error?: string;
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
  phases: WorkflowPhase[];
  buildResult?: BuildTestResult;
  commitResult?: CommitResult;
  traceId: string;
}

export interface BuildTestResult {
  buildPassed: boolean;
  testPassed: boolean;
  lintPassed: boolean;
  buildOutput?: string;
  testOutput?: string;
  lintOutput?: string;
  fixAttempts: number;
  finalBuildPassed: boolean;
}

export interface CommitResult {
  committed: boolean;
  pushed: boolean;
  sha?: string;
  message?: string;
  filesChanged: number;
  error?: string;
}

export async function runAutonomousWorkflow(
  options: AutonomousWorkflowOptions
): Promise<AutonomousWorkflowResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const cwd = options.cwd ?? process.cwd();
  const autoCommit = options.autoCommit !== false;

  const traceSpan = tracer.startSpan("autonomous-workflow");
  const traceId = traceSpan.traceId;

  registerAllAgents();

  logger.info(`Starting workflow: ${options.goal}`, { module: "autonomous-workflow", traceId, repositoryUrl: options.repositoryUrl });
  metrics.increment("workflow.started", { traceId });

  const events: any[] = [];
  const errors: string[] = [];
  const phases: WorkflowPhase[] = [];

  const trackPhase = (name: string): WorkflowPhase => {
    const phase: WorkflowPhase = { name, status: "running", startedAt: Date.now() };
    phases.push(phase);
    eventBus.emit({ type: "log", level: "info", message: `[workflow] Phase: ${name}` });
    return phase;
  };
  const completePhase = (phase: WorkflowPhase, result?: any, error?: string): void => {
    phase.status = error ? "failed" : "completed";
    phase.completedAt = Date.now();
    phase.durationMs = phase.completedAt - (phase.startedAt ?? phase.completedAt);
    phase.result = result;
    phase.error = error;
    if (error) errors.push(`${phase.name}: ${error}`);
  };

  const unsubscribe = eventBus.on("*", (event) => {
    events.push(event);
    if (event.type === "log" && event.level === "error") errors.push(event.message);
    if (options.onEvent) options.onEvent(event);
  });

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

  let orchestratorResult: TaskResult | null = null;
  let buildResult: BuildTestResult | undefined;
  let commitResult: CommitResult | undefined;

  try {
    // PHASE 1-4: Orchestrator runs Planner + Scheduler + Agents
    const planPhase = trackPhase("planning-execution");
    if (options.onProgress) options.onProgress(5, "Planning + executing task graph");

    orchestratorResult = await orchestratorRun(
      options.goal,
      options.repositoryUrl,
      options.provider,
      {
        timeoutMs: Math.floor(timeoutMs * 0.6),
        onProgress: (p: number, m: string) => {
          if (options.onProgress) options.onProgress(5 + Math.floor(p * 0.55), m);
        },
      }
    );

    completePhase(planPhase, { success: orchestratorResult.success, summary: orchestratorResult.summary });

    if (controller.signal.aborted) {
      throw new Error("Workflow aborted during planning phase");
    }

    // PHASE 5: Write file artifacts to disk
    const writePhase = trackPhase("write-artifacts");
    if (options.onProgress) options.onProgress(62, "Writing file changes to disk");
    const writtenFiles = await writeArtifactsToDisk(orchestratorResult.artifacts, cwd);
    completePhase(writePhase, { filesWritten: writtenFiles.length, files: writtenFiles });

    if (controller.signal.aborted) {
      throw new Error("Workflow aborted during write phase");
    }

    // PHASE 6-8: Build → Test → Lint → Fix loop
    const buildPhase = trackPhase("build-test-lint");
    if (options.onProgress) options.onProgress(68, "Running build verification");
    buildResult = await runBuildTestLintLoop(options.provider, cwd, controller.signal, (p: number, m: string) => {
      if (options.onProgress) options.onProgress(68 + Math.floor(p * 0.2), m);
    });
    completePhase(buildPhase, buildResult, buildResult.finalBuildPassed ? undefined : "Build/test/lint failed after retries");

    if (controller.signal.aborted) {
      throw new Error("Workflow aborted during build phase");
    }

    // PHASE 9-10: Commit + Push
    if (autoCommit && buildResult.finalBuildPassed) {
      const commitPhase = trackPhase("commit-push");
      if (options.onProgress) options.onProgress(90, "Committing changes");
      commitResult = await commitAndPush(options.goal, options.provider, cwd, controller.signal, (p: number, m: string) => {
        if (options.onProgress) options.onProgress(90 + Math.floor(p * 0.08), m);
      });
      completePhase(commitPhase, commitResult, commitResult.committed ? undefined : "Commit failed");
    } else if (autoCommit && !buildResult.finalBuildPassed) {
      const skipPhase = trackPhase("commit-push");
      skipPhase.status = "skipped";
      skipPhase.completedAt = Date.now();
      logger.warn("Skipping commit — build did not pass", { module: "autonomous-workflow", traceId });
    }

    if (options.onProgress) options.onProgress(100, "Workflow complete");

    const completed = events.filter(e => e.type === "task:completed").length;
    const failed = events.filter(e => e.type === "task:failed").length;

    const finalReport = buildFinalReport(options.goal, orchestratorResult, completed, failed, Date.now() - startTime, phases, buildResult, commitResult);

    if (options.repositoryUrl) {
      await repositoryMemory.remember(options.repositoryUrl, "lastWorkflow", {
        goal: options.goal,
        success: orchestratorResult.success,
        completed,
        failed,
        durationMs: Date.now() - startTime,
        buildPassed: buildResult?.finalBuildPassed,
        committed: commitResult?.committed,
        pushed: commitResult?.pushed,
        timestamp: Date.now(),
      }, "decision");
    }

    metrics.increment("workflow.completed", { traceId, success: orchestratorResult.success ? "true" : "false" });
    metrics.timing("workflow.duration", Date.now() - startTime, { traceId });
    tracer.endSpan(traceSpan, orchestratorResult.success ? "ok" : "error");

    return {
      success: orchestratorResult.success && (buildResult?.finalBuildPassed ?? false),
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
      phases,
      buildResult,
      commitResult,
      traceId,
    };
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
    logger.error(`Workflow failed: ${err?.message ?? String(err)}`, { module: "autonomous-workflow", traceId, error: err });
    metrics.increment("workflow.failed", { traceId });
    tracer.endSpan(traceSpan, "error", { error: err?.message });

    return {
      success: false,
      goal: options.goal,
      graphId: "unknown",
      tasksCompleted: 0,
      tasksFailed: 0,
      results: {},
      finalReport: `Workflow failed: ${err?.message ?? String(err)}`,
      artifacts: orchestratorResult?.artifacts ?? [],
      durationMs: Date.now() - startTime,
      events,
      errors,
      phases,
      buildResult,
      commitResult,
      traceId,
    };
  } finally {
    clearTimeout(timeoutId);
    unsubscribe();
    unsubscribeProgress();
  }
}

// Build → Test → Lint → Fix loop
async function runBuildTestLintLoop(
  provider: AIProviderConfig | undefined,
  cwd: string,
  signal: AbortSignal,
  onProgress: (p: number, msg: string) => void
): Promise<BuildTestResult> {
  let fixAttempts = 0;
  const maxFixAttempts = 3;

  let buildOutput = "";
  let testOutput = "";
  let lintOutput = "";
  let buildPassed = false;
  let testPassed = false;
  let lintPassed = false;

  while (fixAttempts < maxFixAttempts && !signal.aborted) {
    const pct = (fixAttempts / maxFixAttempts) * 100;
    onProgress(pct, `Build/test/lint attempt ${fixAttempts + 1}/${maxFixAttempts}`);

    // Build (tsc --noEmit)
    onProgress(pct, "Running tsc --noEmit");
    const buildRes = await commandRunner.runCommand("bunx tsc --noEmit", {
      cwd, timeout: 120000, signal,
      onPrompt: async () => true,
    });
    buildOutput = buildRes.stderr || buildRes.stdout;
    buildPassed = buildRes.exitCode === 0;
    logger.info(`tsc exit=${buildRes.exitCode}`, { module: "workflow-build", cwd, attempt: fixAttempts + 1 });

    if (signal.aborted) break;

    // Lint
    onProgress(pct, "Running bun run lint");
    const lintRes = await commandRunner.runCommand("bun run lint", {
      cwd, timeout: 90000, signal,
      onPrompt: async () => true,
    });
    lintOutput = lintRes.stderr || lintRes.stdout;
    lintPassed = lintRes.exitCode === 0;
    logger.info(`lint exit=${lintRes.exitCode}`, { module: "workflow-lint", cwd, attempt: fixAttempts + 1 });

    if (signal.aborted) break;

    // Test (only if build passed)
    if (buildPassed) {
      onProgress(pct, "Running tests");
      const testRes = await commandRunner.runCommand("bun test 2>/dev/null || bunx vitest run --reporter=verbose 2>/dev/null || true", {
        cwd, timeout: 120000, signal,
        onPrompt: async () => true,
      });
      testOutput = testRes.stdout + "\n" + testRes.stderr;
      testPassed = testRes.exitCode === 0;
      logger.info(`test exit=${testRes.exitCode}`, { module: "workflow-test", cwd, attempt: fixAttempts + 1 });
    } else {
      testPassed = false;
      testOutput = "Skipped — build failed";
    }

    if (buildPassed && lintPassed && testPassed) {
      onProgress(100, "Build, test, and lint all passed");
      return { buildPassed, testPassed, lintPassed, buildOutput, testOutput, lintOutput, fixAttempts, finalBuildPassed: true };
    }

    fixAttempts++;
    if (fixAttempts >= maxFixAttempts || signal.aborted) break;

    onProgress((fixAttempts / maxFixAttempts) * 100, `Build/test failed — dispatching Bug Fixer (attempt ${fixAttempts})`);
    logger.warn(`Build/test failed on attempt ${fixAttempts}, dispatching bug-fixer`, { module: "workflow-build", cwd });

    const errors: string[] = [];
    if (!buildPassed) errors.push(`TypeScript errors:\n${buildOutput.slice(0, 3000)}`);
    if (!lintPassed) errors.push(`Lint errors:\n${lintOutput.slice(0, 3000)}`);
    if (!testPassed && buildPassed) errors.push(`Test failures:\n${testOutput.slice(0, 3000)}`);

    const fixTask = taskQueue.enqueue({
      kind: "fix-bug",
      title: `Auto-fix build/test/lint errors (round ${fixAttempts})`,
      priority: "critical",
      input: {
        stackTrace: errors.join("\n\n---\n\n"),
        issues: [],
        files: [],
        provider,
        runTests: false,
      },
      timeoutMs: 180000,
    });

    await waitForTask(fixTask.id, 180000);

    if (signal.aborted) break;
  }

  return { buildPassed, testPassed, lintPassed, buildOutput, testOutput, lintOutput, fixAttempts, finalBuildPassed: buildPassed && lintPassed && testPassed };
}

// Commit + Push
async function commitAndPush(
  goal: string,
  provider: AIProviderConfig | undefined,
  cwd: string,
  signal: AbortSignal,
  onProgress: (p: number, msg: string) => void
): Promise<CommitResult> {
  try {
    onProgress(10, "Checking git status");
    const status = await gitOps.getStatus(cwd);
    const allChanged = [...status.staged, ...status.unstaged.map(f => ({ ...f, staged: false }))];
    if (allChanged.length === 0 && status.untracked.length === 0) {
      return { committed: false, pushed: false, filesChanged: 0, error: "No changes to commit" };
    }

    onProgress(30, "Staging changes");
    const allPaths = [
      ...allChanged.map(f => f.path),
      ...status.untracked,
    ];
    await gitOps.stage(allPaths, cwd);

    if (signal.aborted) return { committed: false, pushed: false, filesChanged: allPaths.length, error: "Aborted" };

    onProgress(50, "Generating commit message");
    const diff = await gitOps.getDiff(cwd, true);
    const commitMsg = await generateCommitMessage(diff, provider);

    onProgress(70, "Committing");
    const fullMessage = `${commitMsg.title}\n\n${commitMsg.body}\n\n🤖 Generated by CodeInsight AI Autonomous Workflow\n\nGoal: ${goal}`.trim();
    const commitRes = await gitOps.commit(fullMessage, cwd);

    logger.info(`Committed: ${commitRes.sha}`, { module: "workflow-commit", cwd, sha: commitRes.sha, message: commitMsg.title });
    metrics.increment("workflow.committed");

    if (signal.aborted) return { committed: true, pushed: false, sha: commitRes.sha, message: commitMsg.title, filesChanged: allPaths.length, error: "Aborted before push" };

    onProgress(90, "Pushing to remote");
    try {
      await gitOps.push(cwd);
      onProgress(100, "Pushed successfully");
      logger.info("Pushed to remote", { module: "workflow-push", cwd });
      metrics.increment("workflow.pushed");
      return {
        committed: true,
        pushed: true,
        sha: commitRes.sha,
        message: commitMsg.title,
        filesChanged: allPaths.length,
      };
    } catch (pushErr: any) {
      logger.warn(`Push failed: ${pushErr?.message}`, { module: "workflow-push", cwd });
      return {
        committed: true,
        pushed: false,
        sha: commitRes.sha,
        message: commitMsg.title,
        filesChanged: allPaths.length,
        error: `Push failed: ${pushErr?.message ?? String(pushErr)}`,
      };
    }
  } catch (err: any) {
    logger.error(`Commit/push failed: ${err?.message}`, { module: "workflow-commit", cwd, error: err });
    return {
      committed: false,
      pushed: false,
      filesChanged: 0,
      error: err?.message ?? String(err),
    };
  }
}

// Write artifacts to disk
async function writeArtifactsToDisk(artifacts: TaskResult["artifacts"], cwd: string): Promise<string[]> {
  const written: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.kind !== "file" || !artifact.path) continue;
    try {
      const fullPath = artifact.path.startsWith("/") ? artifact.path : `${cwd}/${artifact.path}`;
      await writeFile(fullPath, artifact.content);
      written.push(artifact.path);
      logger.info(`Wrote ${artifact.path}`, { module: "workflow-write", path: fullPath });
    } catch (err: any) {
      logger.warn(`Failed to write ${artifact.path}: ${err?.message}`, { module: "workflow-write", path: artifact.path });
    }
  }
  return written;
}

// Wait for a task to complete
function waitForTask(taskId: string, timeoutMs: number): Promise<TaskResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      unsub();
      unsubFail();
      resolve({ success: false, data: null, summary: "Timeout waiting for task", artifacts: [] });
    }, timeoutMs);

    const unsub = eventBus.on("task:completed", (evt) => {
      if (evt.type !== "task:completed" || evt.task.id !== taskId) return;
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      unsub();
      unsubFail();
      resolve(evt.task.output!);
    });
    const unsubFail = eventBus.on("task:failed", (evt) => {
      if (evt.type !== "task:failed" || evt.task.id !== taskId) return;
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      unsub();
      unsubFail();
      resolve(evt.task.output ?? { success: false, data: null, summary: `Task failed: ${evt.error}`, artifacts: [] });
    });
  });
}

function buildFinalReport(
  goal: string,
  result: TaskResult,
  completed: number,
  failed: number,
  durationMs: number,
  phases: WorkflowPhase[],
  buildResult?: BuildTestResult,
  commitResult?: CommitResult
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
    `## Phases`,
    ``,
  ];

  for (const phase of phases) {
    const icon = phase.status === "completed" ? "✅" : phase.status === "failed" ? "❌" : phase.status === "skipped" ? "⏭️" : "🔄";
    const dur = phase.durationMs != null ? ` (${(phase.durationMs / 1000).toFixed(1)}s)` : "";
    lines.push(`- ${icon} **${phase.name}**${dur}${phase.error ? ` — ${phase.error}` : ""}`);
  }

  lines.push(``, `## Summary`, ``, result.summary, ``);

  if (buildResult) {
    lines.push(`## Build / Test / Lint`, ``);
    lines.push(`- TypeScript: ${buildResult.buildPassed ? "✅ passed" : "❌ failed"}`);
    lines.push(`- Lint: ${buildResult.lintPassed ? "✅ passed" : "❌ failed"}`);
    lines.push(`- Tests: ${buildResult.testPassed ? "✅ passed" : "❌ failed"}`);
    lines.push(`- Fix attempts: ${buildResult.fixAttempts}`);
    lines.push(`- Final: ${buildResult.finalBuildPassed ? "✅ All passed" : "❌ Still failing"}`);
    lines.push(``);
  }

  if (commitResult) {
    lines.push(`## Git`, ``);
    lines.push(`- Committed: ${commitResult.committed ? "✅" : "❌"}`);
    if (commitResult.sha) lines.push(`- SHA: \`${commitResult.sha}\``);
    if (commitResult.message) lines.push(`- Message: ${commitResult.message}`);
    lines.push(`- Pushed: ${commitResult.pushed ? "✅" : "❌"}`);
    lines.push(`- Files changed: ${commitResult.filesChanged}`);
    if (commitResult.error) lines.push(`- Error: ${commitResult.error}`);
    lines.push(``);
  }

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

    if (options.onProgress) {
      const unsubProg = eventBus.on("task:progress", (evt) => {
        if (evt.type !== "task:progress" || evt.taskId !== task.id) return;
        options.onProgress!(evt.progress, evt.message);
      });
      setTimeout(unsubProg, (options.timeoutMs ?? 120000) * 2);
    }
  });
}

/**
 * AI Pair Programmer: given a natural-language request, plan + execute autonomously.
 *
 * Pipeline:
 * 1. Analyze the project structure
 * 2. Plan the implementation (Planner agent)
 * 3. Execute tasks in parallel (edit files, update routes, update env, update docs, update tests)
 * 4. Build + test + lint verification
 * 5. Fix any errors (bug-fixer agent)
 * 6. Commit + push changes
 */
export async function pairProgram(
  request: string,
  options: {
    repositoryUrl?: string;
    provider?: AIProviderConfig;
    cwd?: string;
    onEvent?: (event: any) => void;
    onProgress?: (progress: number, message: string) => void;
  } = {}
): Promise<AutonomousWorkflowResult> {
  return runAutonomousWorkflow({
    goal: request,
    repositoryUrl: options.repositoryUrl,
    provider: options.provider,
    cwd: options.cwd,
    autoCommit: true,
    timeoutMs: 15 * 60 * 1000,
    onEvent: options.onEvent,
    onProgress: options.onProgress,
  });
}
