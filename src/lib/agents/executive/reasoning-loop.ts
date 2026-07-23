// CodeInsight AI — Continuous Reasoning Loop (Phase I)
// The mission doesn't end after one ReAct cycle. It loops until:
//   - the goal is achieved, OR
//   - quality gates pass, OR
//   - max iterations are exceeded, OR
//   - the user cancels.
//
// The ContinuousReasoningLoop wraps the existing ReActLoop (Phase A+B+E) and
// adds a QualityGate (Phase I) that periodically verifies the codebase
// actually meets the configured bar.
//
// Design:
//   - The loop runs ReActLoop in batches of up to `QUALITY_CHECK_INTERVAL`
//     (default 5) iterations. Each batch creates a fresh ReActLoop instance
//     with `maxIterations: min(5, remaining_budget)`. This preserves the
//     Phase E Reflection/Replanner/Rollback machinery WITHIN each batch
//     (the Replanner is invoked inline when Reflection signals
//     shouldReplan).
//   - `consecutiveErrors` is tracked at the ContinuousReasoningLoop level
//     (not in ReActLoop) so the "Too many consecutive errors" failure
//     condition accumulates across batches.
//   - After each batch, the loop runs the QualityGate. If the gate passes
//     (or the AI said `is_complete` and the gate passes), the mission
//     succeeds. Otherwise the quality report is added to mission memory
//     as context for the next batch.
//   - The loop is cancellable at any point via `abort()` → `controller.abort()`.
//
// Loop pseudocode (matches the Phase I spec):
//   while (iterations < max && !aborted) {
//     1. Run a batch of ReAct cycles (up to 5)
//     2. Reflection's shouldReplan / shouldRetry are handled inside ReActLoop
//     3. Run quality gate (after every batch, or when is_complete)
//     4. If quality gate passes → break + emit mission:completed (success)
//     5. If quality gate fails → add report to memory, continue
//   }
//   Final: emit mission:completed with MissionStats
//
// Termination:
//   - iterations ≥ maxIterations → fail "Max iterations exceeded"
//   - aborted → cancel
//   - consecutiveErrors ≥ 5 → fail "Too many consecutive errors"

import type { AIProviderConfig } from "@/lib/agents/ai-client";

import { missionEmitter } from "./event-emitter";
import { ReActLoop } from "./react-loop";
import { qualityGate, type QualityReport, type QualityThresholds } from "./quality-gate";
import { confidenceTracker } from "./confidence";
import type {
  AgentInvocation,
  ExecutiveDecision,
  MissionContext,
  MissionEvent,
  MissionMemory,
  MissionState,
  MissionStats,
  ToolCall,
} from "./types";

// ── Public options ──────────────────────────────────────────────────────────
export interface ReasoningLoopOptions {
  /** Hard cap on total iterations across all batches (default 20). */
  maxIterations?: number;
  /** Phase E: max replan attempts before the mission is failed (default 5). */
  maxRevisions?: number;
  /** Override the default quality thresholds. */
  qualityThresholds?: Partial<QualityThresholds>;
  /** Optional AI provider for the code-reviewer check. */
  provider?: AIProviderConfig;
  /** Optional external abort signal (e.g. from BaseAgent.run). */
  signal?: AbortSignal;
  /** Called whenever the loop transitions between phases (react / quality / done). */
  onPhase?: (phase: ReasoningPhase, iteration: number) => void;
  /** Called whenever a quality report is produced. */
  onQualityReport?: (report: QualityReport) => void;
}

export type ReasoningPhase =
  | "react"
  | "quality"
  | "complete"
  | "fail"
  | "cancel";

// ── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_MAX_REVISIONS = 5;
const QUALITY_CHECK_INTERVAL = 5;
const MAX_CONSECUTIVE_ERRORS = 5;

// ── Helper: build a MissionContext bound to missionEmitter ──────────────────
function buildMissionContext(
  missionId: string,
  goal: string,
  cwd: string,
  repositoryUrl: string | undefined,
  provider: AIProviderConfig | undefined,
  signal: AbortSignal,
): MissionContext {
  return {
    missionId,
    goal,
    repositoryUrl,
    cwd,
    provider,
    signal,
    emit: (event: MissionEvent) => missionEmitter.emit(event),
    getState: () => missionEmitter.getState(missionId)!,
    updateState: (updates) => missionEmitter.updateState(missionId, updates),
    updateMemory: (updates: Partial<MissionMemory>) =>
      missionEmitter.updateMemory(missionId, updates),
    recordToolCall: (call: ToolCall) =>
      missionEmitter.recordToolCall(missionId, call),
    recordAgentInvocation: (inv: AgentInvocation) =>
      missionEmitter.recordAgentInvocation(missionId, inv),
    recordDecision: (decision: ExecutiveDecision) =>
      missionEmitter.recordDecision(missionId, decision),
    recordFileChange: (p, action, additions, deletions) =>
      missionEmitter.recordFileChange(missionId, p, action, additions, deletions),
    recordTerminalOutput: (stream, data) =>
      missionEmitter.recordTerminalOutput(missionId, stream, data),
  };
}

// ── ContinuousReasoningLoop ─────────────────────────────────────────────────
export class ContinuousReasoningLoop {
  private aborted = false;
  private iteration = 0;
  private readonly controller = new AbortController();
  /** Disposed once the loop has settled (success/fail/cancel). */
  private settled = false;

  /**
   * Run the full continuous reasoning loop.
   *
   * Returns MissionStats with the final iteration count, tool/agent/file
   * tallies, final confidence, and the quality score from the last quality
   * gate evaluation. Also emits a `mission:completed` MissionEvent before
   * returning.
   */
  async run(
    missionId: string,
    goal: string,
    context: {
      repositoryUrl?: string;
      cwd: string;
      provider?: AIProviderConfig;
    },
    options?: ReasoningLoopOptions,
  ): Promise<MissionStats> {
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const maxRevisions = options?.maxRevisions ?? DEFAULT_MAX_REVISIONS;
    const startTime = Date.now();

    // Wire the optional external signal (e.g. from BaseAgent.run) into our
    // internal controller so the loop stops on either signal.
    if (options?.signal) {
      const external = options.signal;
      if (external.aborted) {
        this.aborted = true;
        this.controller.abort();
      } else {
        external.addEventListener(
          "abort",
          () => {
            this.aborted = true;
            this.controller.abort();
          },
          { once: true },
        );
      }
    }

    // Configure the quality gate with any provided overrides / provider.
    if (options?.qualityThresholds) {
      qualityGate.setThresholds(options.qualityThresholds);
    }
    if (context.provider) {
      qualityGate.setProvider(context.provider);
    }

    // Initialize the confidence tracker pointer + mission state.
    confidenceTracker.setActive(missionId);
    missionEmitter.updateState(missionId, {
      maxIterations,
      status: "executing",
      currentPhase: "observe",
    });
    missionEmitter.emit({
      type: "mission:status",
      missionId,
      status: "executing",
      timestamp: Date.now(),
    });
    options?.onPhase?.("react", 0);

    let consecutiveErrors = 0;
    let lastQualityCheckIteration = 0;
    let finalReport: QualityReport | null = null;
    let lastFailureReason: string | null = null;

    while (
      this.iteration < maxIterations &&
      !this.aborted &&
      !this.settled
    ) {
      // ── 1. Run a batch of ReAct cycles (up to QUALITY_CHECK_INTERVAL) ──
      const remainingBudget = maxIterations - this.iteration;
      const batchSize = Math.min(QUALITY_CHECK_INTERVAL, remainingBudget);

      const ctx = buildMissionContext(
        missionId,
        goal,
        context.cwd,
        context.repositoryUrl,
        context.provider,
        this.controller.signal,
      );

      // Reset status to "executing" in case the previous batch set it to
      // "verifying" or "completed".
      const preStatus = missionEmitter.getState(missionId)?.status;
      if (preStatus !== "executing" && preStatus !== "failed") {
        missionEmitter.updateState(missionId, {
          status: "executing",
          currentPhase: "observe",
        });
      }

      // Each batch gets a fresh ReActLoop. The Phase E machinery
      // (Reflection → Replanner → auto-rollback) operates within each
      // batch. The cumulative iteration count + consecutive-error tracking
      // live in this ContinuousReasoningLoop.
      const reactLoop = new ReActLoop(missionId, {
        maxIterations: batchSize,
        provider: context.provider,
        maxRevisions,
        maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
      });

      let state: MissionState;
      const batchStartIteration = this.iteration;
      try {
        state = await reactLoop.run(goal, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        missionEmitter.emit({
          type: "error",
          missionId,
          message: `ReAct batch crashed: ${msg}`,
          recoverable: true,
          timestamp: Date.now(),
        });
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          lastFailureReason = `Too many consecutive errors (${consecutiveErrors})`;
          break;
        }
        // Try to recover on the next batch.
        const fallbackState = missionEmitter.getState(missionId);
        if (!fallbackState) {
          lastFailureReason = "Mission state vanished mid-loop";
          break;
        }
        state = fallbackState;
      }

      // ReActLoop resets its local iteration counter on each run() call,
      // so state.iteration is the per-batch count. Compute the cumulative
      // count and sync it back to mission state so the AI prompt and the
      // UI both show the true progress.
      const batchIterations = Math.max(0, state.iteration);
      this.iteration = batchStartIteration + batchIterations;
      missionEmitter.updateState(missionId, {
        iteration: this.iteration,
        maxIterations,
      });

      options?.onPhase?.("react", this.iteration);

      // ── Check termination: abort ──────────────────────────────────────
      if (this.aborted || this.controller.signal.aborted) {
        break;
      }

      // ── Check termination: ReActLoop failed ───────────────────────────
      if (state.status === "failed") {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          lastFailureReason = `Too many consecutive errors (${consecutiveErrors})`;
          break;
        }
        // The ReActLoop already set status=failed; let the next batch
        // try again unless we've blown the budget.
        if (this.iteration >= maxIterations) {
          lastFailureReason = "Max iterations exceeded (with failures)";
          break;
        }
        // Reset to "executing" for the next batch.
        missionEmitter.updateState(missionId, {
          status: "executing",
          currentPhase: "observe",
        });
        continue;
      }
      consecutiveErrors = 0;

      // ── Determine if we should run the quality gate ──────────────────
      // Run the quality gate when ANY of:
      //   - The AI said is_complete (status == "verifying")
      //   - We've completed a full batch of QUALITY_CHECK_INTERVAL iterations
      //   - This was the last batch (iteration >= maxIterations)
      const isCompleteSignal = state.status === "verifying";
      const batchRanToCompletion = batchIterations >= batchSize;
      const isLastBatch = this.iteration >= maxIterations;

      if (isCompleteSignal || batchRanToCompletion || isLastBatch) {
        options?.onPhase?.("quality", this.iteration);

        // Move to "verifying" so the UI shows the quality gate is running.
        missionEmitter.updateState(missionId, {
          status: "verifying",
          currentPhase: "verify",
        });

        try {
          finalReport = await qualityGate.evaluate(missionId, state);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          missionEmitter.emit({
            type: "error",
            missionId,
            message: `Quality gate crashed: ${msg}`,
            recoverable: true,
            timestamp: Date.now(),
          });
          // Synthesize a failing report so the loop continues.
          finalReport = {
            overallPassed: false,
            checks: [],
            score: 0,
            blockingIssues: [`Quality gate crashed: ${msg}`],
            recommendations: ["Retry the quality gate on the next iteration."],
          };
        }
        options?.onQualityReport?.(finalReport);
        lastQualityCheckIteration = this.iteration;

        // ── Quality gate passed → success ─────────────────────────────
        if (qualityGate.isComplete(finalReport)) {
          this.settled = true;
          return this.succeed(missionId, finalReport, startTime, options);
        }

        // ── Quality gate failed → add report to memory, continue ──────
        // The quality report becomes context for the next batch.
        const knownIssues = [...state.memory.knownIssues];
        knownIssues.push(
          `Quality gate failed (iter ${this.iteration}, score ${finalReport.score}/100): ${finalReport.blockingIssues.join("; ")}`,
        );
        missionEmitter.updateMemory(missionId, {
          knownIssues: knownIssues.slice(-25),
        });
        missionEmitter.emit({
          type: "memory:update",
          missionId,
          key: "qualityReport",
          value: {
            iteration: this.iteration,
            score: finalReport.score,
            blockingIssues: finalReport.blockingIssues,
            recommendations: finalReport.recommendations,
            checks: finalReport.checks.map((c) => ({
              name: c.name,
              passed: c.passed,
              score: c.score,
              detail: c.detail,
            })),
          },
          timestamp: Date.now(),
        });

        // If the AI said is_complete but quality gate failed, the AI was
        // premature — emit an error so the UI flags this and continue.
        if (isCompleteSignal) {
          missionEmitter.emit({
            type: "error",
            missionId,
            message: `Executive marked mission complete but quality gate failed (score ${finalReport.score}/100). Continuing.`,
            recoverable: true,
            timestamp: Date.now(),
          });
        }

        // If this was the last batch and quality failed, we'll fall
        // through to the post-loop failure handling below.
        if (isLastBatch) {
          break;
        }
      }

      // ── Continue to the next batch ────────────────────────────────────
      // Reset status to "executing" for the next batch.
      missionEmitter.updateState(missionId, {
        status: "executing",
        currentPhase: "observe",
      });
    }

    // ── Loop ended — figure out why ────────────────────────────────────────
    const finalState = missionEmitter.getState(missionId);
    if (!finalState) {
      // Mission state vanished — emit a hard error and return empty stats.
      const emptyStats: MissionStats = {
        iterations: this.iteration,
        toolsCalled: 0,
        agentsInvoked: 0,
        filesModified: 0,
        decisions: 0,
        errors: 1,
        finalConfidence: 0,
        qualityScore: 0,
        durationMs: Date.now() - startTime,
      };
      this.emitCompleted(missionId, false, "Mission state vanished", emptyStats);
      return emptyStats;
    }

    // Run a final quality gate if we never ran one (e.g. loop exited via
    // the consecutiveErrors path before reaching a quality-check boundary).
    if (!finalReport) {
      missionEmitter.updateState(missionId, {
        status: "verifying",
        currentPhase: "verify",
      });
      try {
        finalReport = await qualityGate.evaluate(missionId, finalState);
        options?.onQualityReport?.(finalReport);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        finalReport = {
          overallPassed: false,
          checks: [],
          score: 0,
          blockingIssues: [`Quality gate crashed: ${msg}`],
          recommendations: [],
        };
      }
    }

    // ── Cancelled ─────────────────────────────────────────────────────────
    if (this.aborted) {
      return this.cancel(missionId, finalReport, startTime, options);
    }

    // ── Too many consecutive errors ───────────────────────────────────────
    if (lastFailureReason?.startsWith("Too many consecutive errors")) {
      return this.fail(
        missionId,
        finalState,
        finalReport,
        lastFailureReason,
        startTime,
        options,
      );
    }

    // ── Max iterations exceeded ───────────────────────────────────────────
    if (this.iteration >= maxIterations) {
      if (finalReport.overallPassed) {
        // Edge case: quality gate passed on the very last iteration.
        return this.succeed(missionId, finalReport, startTime, options);
      }
      return this.fail(
        missionId,
        finalState,
        finalReport,
        `Max iterations exceeded (${maxIterations})`,
        startTime,
        options,
      );
    }

    // ── Default: if quality gate passed, succeed; otherwise fail ──────────
    if (finalReport.overallPassed) {
      return this.succeed(missionId, finalReport, startTime, options);
    }
    return this.fail(
      missionId,
      finalState,
      finalReport,
      "Mission ended without passing quality gate",
      startTime,
      options,
    );
  }

  /** Abort the loop (user cancelled). Idempotent. */
  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    try {
      this.controller.abort();
    } catch {
      // Ignore — controller may already be aborted.
    }
  }

  /** Get the current iteration count (0 before run starts). */
  getIteration(): number {
    return this.iteration;
  }

  /** True if abort() has been called. */
  isAborted(): boolean {
    return this.aborted;
  }

  // ── Terminal handlers ────────────────────────────────────────────────────
  private succeed(
    missionId: string,
    report: QualityReport,
    startTime: number,
    options?: ReasoningLoopOptions,
  ): MissionStats {
    this.settled = true;
    const state = missionEmitter.getState(missionId);
    const stats: MissionStats = {
      iterations: state?.iteration ?? this.iteration,
      toolsCalled: state?.toolHistory.length ?? 0,
      agentsInvoked: state?.agentHistory.length ?? 0,
      filesModified: state?.filesModified.length ?? 0,
      decisions: state?.decisions.length ?? 0,
      errors: state?.errors.length ?? 0,
      finalConfidence: state?.confidence ?? 0,
      qualityScore: report.score,
      durationMs: Date.now() - startTime,
    };
    missionEmitter.updateState(missionId, {
      status: "completed",
      currentPhase: "decide",
      buildStatus: this.lookupCheckPassed(report, "build") ? "pass" : "fail",
      testStatus: this.lookupCheckPassed(report, "tests") ? "pass" : "fail",
    });
    options?.onPhase?.("complete", stats.iterations);
    this.emitCompleted(
      missionId,
      true,
      `Mission completed in ${stats.durationMs}ms across ${stats.iterations} iterations (confidence ${stats.finalConfidence}%, quality ${stats.qualityScore}/100).`,
      stats,
    );
    return stats;
  }

  private fail(
    missionId: string,
    state: MissionState,
    report: QualityReport | null,
    reason: string,
    startTime: number,
    options?: ReasoningLoopOptions,
  ): MissionStats {
    this.settled = true;
    state.errors.push(reason);
    const stats: MissionStats = {
      iterations: state.iteration,
      toolsCalled: state.toolHistory.length,
      agentsInvoked: state.agentHistory.length,
      filesModified: state.filesModified.length,
      decisions: state.decisions.length,
      errors: state.errors.length,
      finalConfidence: state.confidence,
      qualityScore: report?.score ?? 0,
      durationMs: Date.now() - startTime,
    };
    missionEmitter.updateState(missionId, {
      status: "failed",
      currentPhase: "decide",
      buildStatus: this.lookupCheckPassed(report, "build") ? "pass" : "fail",
      testStatus: this.lookupCheckPassed(report, "tests") ? "pass" : "fail",
    });
    missionEmitter.emit({
      type: "error",
      missionId,
      message: reason,
      recoverable: false,
      timestamp: Date.now(),
    });
    options?.onPhase?.("fail", stats.iterations);
    this.emitCompleted(
      missionId,
      false,
      `Mission failed: ${reason} (${stats.durationMs}ms, ${stats.iterations} iterations).`,
      stats,
    );
    return stats;
  }

  private cancel(
    missionId: string,
    report: QualityReport | null,
    startTime: number,
    options?: ReasoningLoopOptions,
  ): MissionStats {
    this.settled = true;
    const state = missionEmitter.getState(missionId);
    const stats: MissionStats = {
      iterations: state?.iteration ?? this.iteration,
      toolsCalled: state?.toolHistory.length ?? 0,
      agentsInvoked: state?.agentHistory.length ?? 0,
      filesModified: state?.filesModified.length ?? 0,
      decisions: state?.decisions.length ?? 0,
      errors: state?.errors.length ?? 0,
      finalConfidence: state?.confidence ?? 0,
      qualityScore: report?.score ?? 0,
      durationMs: Date.now() - startTime,
    };
    missionEmitter.updateState(missionId, {
      status: "cancelled",
      currentPhase: "decide",
    });
    options?.onPhase?.("cancel", stats.iterations);
    this.emitCompleted(
      missionId,
      false,
      `Mission cancelled after ${stats.durationMs}ms (${stats.iterations} iterations).`,
      stats,
    );
    return stats;
  }

  /** Emit the terminal `mission:completed` event. */
  private emitCompleted(
    missionId: string,
    success: boolean,
    summary: string,
    stats: MissionStats,
  ): void {
    missionEmitter.emit({
      type: "mission:completed",
      missionId,
      success,
      summary,
      durationMs: stats.durationMs,
      stats,
      timestamp: Date.now(),
    });
  }

  /** Look up a named check in a QualityReport and return its passed flag. */
  private lookupCheckPassed(
    report: QualityReport | null,
    name: string,
  ): boolean | undefined {
    if (!report) return undefined;
    const check = report.checks.find((c) => c.name === name);
    return check?.passed;
  }
}
