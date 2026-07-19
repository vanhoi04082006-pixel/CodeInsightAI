// CodeInsight AI — Quality Gate (Phase I)
// The mission doesn't end when the AI says "is_complete" — it ends when the
// codebase actually meets a configurable quality bar. The QualityGate runs
// real build / test / lint commands, invokes the code-reviewer agent on the
// modified files, and checks the Executive's confidence, then produces a
// structured QualityReport that the ContinuousReasoningLoop uses to decide
// whether to terminate or keep iterating.
//
// Each check emits `agent:acting` + `agent:result` MissionEvents so the SSE
// stream reflects the gate in real time (UI shows "Running tsc…", "Lint OK",
// etc.). Terminal output from each command is also streamed via
// `terminal:output` events so the LiveTerminal panel shows live progress.
//
// The gate never throws — failures are surfaced as `passed: false` checks
// with a `detail` string, and the overall `blockingIssues` list tells the
// ContinuousReasoningLoop exactly what to fix in the next iteration.

import * as path from "path";
import type { AIProviderConfig } from "@/lib/agents/ai-client";
import { commandRunner } from "@/lib/terminal/command-runner";
import { readFile, fileExists } from "@/lib/repo-editor/file-operations";
import { agentRegistry } from "@/lib/agents/agent-registry";
import type { Task, TaskResult } from "@/lib/agents/types";

import { missionEmitter } from "./event-emitter";
import { confidenceTracker } from "./confidence";
import type { MissionState } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export interface QualityCheck {
  /** Short identifier: "build", "tests", "lint", "review", "confidence". */
  name: string;
  /** Did this check pass? */
  passed: boolean;
  /** 0-100 for scored checks (tests, review, confidence); undefined for boolean checks. */
  score?: number;
  /** Human-readable detail: "91/91 tests passed", "0 TS errors", etc. */
  detail?: string;
  /** Wall-clock duration of the check in ms. */
  durationMs?: number;
  timestamp: number;
}

export interface QualityReport {
  /** True iff every required check passed. */
  overallPassed: boolean;
  /** Individual check results in the order they ran. */
  checks: QualityCheck[];
  /** 0-100 overall score (weighted average of scored checks). */
  score: number;
  /** What's preventing pass — empty when overallPassed is true. */
  blockingIssues: string[];
  /** Suggested next actions for the failing checks. */
  recommendations: string[];
}

export interface QualityThresholds {
  /** Build must exit 0 to pass. */
  build: boolean;
  /** Test pass-rate threshold (0-1). Default 0.9 (90%). */
  tests: number;
  /** Lint must exit 0 to pass. */
  lint: boolean;
  /** Code-review score threshold (0-100). Default 80. */
  reviewScore: number;
  /** Executive confidence threshold (0-100). Default 70. */
  confidence: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  build: true,
  tests: 0.9,
  lint: true,
  reviewScore: 80,
  confidence: 70,
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const BUILD_TIMEOUT_MS = 120_000; // tsc on a large project can be slow
const TEST_TIMEOUT_MS = 180_000; // bun test on a large suite
const LINT_TIMEOUT_MS = 120_000;
const REVIEW_TIMEOUT_MS = 90_000;

function now(): number {
  return Date.now();
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Parse test runner output for "X passed / Y total" counts.
 * Supports the common formats emitted by bun test, vitest, and jest:
 *   - `N pass` / `M fail`                    (bun test)
 *   - `Tests: N passed, M failed, T total`   (jest)
 *   - `N tests passed` / `M tests failed`    (vitest)
 *   - `X/Y passed`                           (generic)
 * Returns { passed, total, ratio } or null when no counts were found.
 */
function parseTestCounts(stdout: string, stderr: string): {
  passed: number;
  total: number;
  ratio: number;
} | null {
  const text = `${stdout}\n${stderr}`;

  // jest-style: "Tests: 5 passed, 2 failed, 7 total"
  const jestMatch = text.match(
    /tests?:\s*(\d+)\s*passed,?\s*(?:(\d+)\s*failed,?)?\s*(\d+)\s*total/i,
  );
  if (jestMatch) {
    const passed = parseInt(jestMatch[1], 10);
    const total = parseInt(jestMatch[3], 10);
    if (total > 0) {
      return { passed, total, ratio: passed / total };
    }
  }

  // bun test style: "N pass" / "M fail"
  const bunPass = text.match(/(\d+)\s+pass\b/i);
  const bunFail = text.match(/(\d+)\s+fail\b/i);
  if (bunPass) {
    const passed = parseInt(bunPass[1], 10);
    const failed = bunFail ? parseInt(bunFail[1], 10) : 0;
    const total = passed + failed;
    if (total > 0) {
      return { passed, total, ratio: passed / total };
    }
  }

  // vitest style: "N tests passed" / "M tests failed"
  const vitPass = text.match(/(\d+)\s+tests?\s+passed/i);
  const vitFail = text.match(/(\d+)\s+tests?\s+failed/i);
  if (vitPass) {
    const passed = parseInt(vitPass[1], 10);
    const failed = vitFail ? parseInt(vitFail[1], 10) : 0;
    const total = passed + failed;
    if (total > 0) {
      return { passed, total, ratio: passed / total };
    }
  }

  // generic: "X/Y passed"
  const generic = text.match(/(\d+)\s*\/\s*(\d+)\s+passed/i);
  if (generic) {
    const passed = parseInt(generic[1], 10);
    const total = parseInt(generic[2], 10);
    if (total > 0) {
      return { passed, total, ratio: passed / total };
    }
  }

  return null;
}

// ── QualityGate class ───────────────────────────────────────────────────────
export class QualityGate {
  private thresholds: QualityThresholds = { ...DEFAULT_THRESHOLDS };
  /** Optional AI provider — passed to the code-reviewer agent. */
  private provider: AIProviderConfig | undefined;

  /** Configure the AI provider used by the review check. */
  setProvider(provider: AIProviderConfig | undefined): void {
    this.provider = provider;
  }

  /** Update one or more thresholds (mutable configuration). */
  setThresholds(updates: Partial<QualityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...updates };
  }

  /** Get a snapshot of the current thresholds. */
  getThresholds(): Readonly<QualityThresholds> {
    return { ...this.thresholds };
  }

  /**
   * Run all quality checks on the current mission state.
   * Each check emits `agent:acting` + `agent:result` MissionEvents so the
   * SSE stream reflects progress in real time.
   */
  async evaluate(
    missionId: string,
    state: MissionState,
  ): Promise<QualityReport> {
    const checks: QualityCheck[] = [];
    const blockingIssues: string[] = [];
    const recommendations: string[] = [];

    // 1. Build
    const buildCheck = await this.runBuildCheck(missionId, state);
    checks.push(buildCheck);
    if (this.thresholds.build && !buildCheck.passed) {
      blockingIssues.push(`Build failed: ${buildCheck.detail ?? "tsc --noEmit exited non-zero"}`);
      recommendations.push("Fix TypeScript errors before continuing.");
    }

    // 2. Tests
    const testsCheck = await this.runTestsCheck(missionId, state);
    checks.push(testsCheck);
    const testRatio = testsCheck.score ?? 0;
    if (testRatio < this.thresholds.tests * 100) {
      const ratioPct = Math.round(testRatio);
      blockingIssues.push(
        `Tests below threshold: ${testsCheck.detail ?? `${ratioPct}% pass rate`} (need ${Math.round(this.thresholds.tests * 100)}%)`,
      );
      recommendations.push("Inspect failing tests and fix the implementation or update fixtures.");
    }

    // 3. Lint
    const lintCheck = await this.runLintCheck(missionId, state);
    checks.push(lintCheck);
    if (this.thresholds.lint && !lintCheck.passed) {
      blockingIssues.push(`Lint failed: ${lintCheck.detail ?? "eslint exited non-zero"}`);
      recommendations.push("Run `bun run lint --fix` and address remaining issues manually.");
    }

    // 4. Review
    const reviewCheck = await this.runReviewCheck(missionId, state);
    checks.push(reviewCheck);
    if ((reviewCheck.score ?? 0) < this.thresholds.reviewScore) {
      blockingIssues.push(
        `Code review score too low: ${reviewCheck.score ?? 0}/100 (need ${this.thresholds.reviewScore})`,
      );
      recommendations.push("Address high/critical issues from the code review before completing.");
    }

    // 5. Confidence
    const confCheck = this.runConfidenceCheck(missionId, state);
    checks.push(confCheck);
    if ((confCheck.score ?? 0) < this.thresholds.confidence) {
      blockingIssues.push(
        `Confidence too low: ${confCheck.score ?? 0}% (need ${this.thresholds.confidence}%)`,
      );
      recommendations.push("Gather more context or verify the approach before completing.");
    }

    // Overall pass = no blocking issues.
    const overallPassed = blockingIssues.length === 0;
    const score = this.computeOverallScore(checks);

    return {
      overallPassed,
      checks,
      score,
      blockingIssues,
      recommendations,
    };
  }

  /** A report is "complete" iff overallPassed is true. */
  isComplete(report: QualityReport): boolean {
    return report.overallPassed;
  }

  /** Convenience: extract the blocking issues from a report. */
  getBlockingIssues(report: QualityReport): string[] {
    return [...report.blockingIssues];
  }

  // ── Individual checks ──────────────────────────────────────────────────

  /** 1. Build: `bunx tsc --noEmit`. Pass iff exit 0. */
  private async runBuildCheck(
    missionId: string,
    state: MissionState,
  ): Promise<QualityCheck> {
    const start = now();
    const detail = "bunx tsc --noEmit";
    this.emitActing(missionId, "build-check", `Running ${detail}`);

    try {
      const result = await commandRunner.runCommand("bunx tsc --noEmit", {
        cwd: state.cwd,
        timeout: BUILD_TIMEOUT_MS,
        recordHistory: false,
        onStdout: (data) => this.emitTerminal(missionId, "stdout", data),
        onStderr: (data) => this.emitTerminal(missionId, "stderr", data),
        onPrompt: async () => true,
      });
      const passed = result.exitCode === 0;
      const tsErrorCount = this.countTsErrors(result.stdout, result.stderr);
      const summary = passed
        ? `0 TS errors (exit 0)`
        : `${tsErrorCount} TS error${tsErrorCount === 1 ? "" : "s"} (exit ${result.exitCode})`;

      this.emitResult(
        missionId,
        "build-check",
        passed,
        `${detail} → ${summary}`,
      );

      return {
        name: "build",
        passed,
        detail: summary,
        durationMs: now() - start,
        timestamp: start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitResult(missionId, "build-check", false, `${detail} → ${msg}`);
      return {
        name: "build",
        passed: false,
        detail: truncate(msg, 200),
        durationMs: now() - start,
        timestamp: start,
      };
    }
  }

  /** 2. Tests: `bun test`. Pass iff ratio ≥ threshold. */
  private async runTestsCheck(
    missionId: string,
    state: MissionState,
  ): Promise<QualityCheck> {
    const start = now();
    const detail = "bun test";
    this.emitActing(missionId, "test-check", `Running ${detail}`);

    try {
      const result = await commandRunner.runCommand("bun test", {
        cwd: state.cwd,
        timeout: TEST_TIMEOUT_MS,
        recordHistory: false,
        onStdout: (data) => this.emitTerminal(missionId, "stdout", data),
        onStderr: (data) => this.emitTerminal(missionId, "stderr", data),
        onPrompt: async () => true,
      });

      const counts = parseTestCounts(result.stdout, result.stderr);
      const ratio = counts ? counts.ratio : result.exitCode === 0 ? 1 : 0;
      const passed = ratio >= this.thresholds.tests;
      const summary = counts
        ? `${counts.passed}/${counts.total} tests passed (${Math.round(ratio * 100)}%)`
        : result.exitCode === 0
          ? "Tests passed (exit 0)"
          : `Tests failed (exit ${result.exitCode})`;

      this.emitResult(missionId, "test-check", passed, `${detail} → ${summary}`);

      return {
        name: "tests",
        passed,
        score: Math.round(ratio * 100),
        detail: summary,
        durationMs: now() - start,
        timestamp: start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitResult(missionId, "test-check", false, `${detail} → ${msg}`);
      return {
        name: "tests",
        passed: false,
        score: 0,
        detail: truncate(msg, 200),
        durationMs: now() - start,
        timestamp: start,
      };
    }
  }

  /** 3. Lint: `bun run lint`. Pass iff exit 0. */
  private async runLintCheck(
    missionId: string,
    state: MissionState,
  ): Promise<QualityCheck> {
    const start = now();
    const detail = "bun run lint";
    this.emitActing(missionId, "lint-check", `Running ${detail}`);

    try {
      const result = await commandRunner.runCommand("bun run lint", {
        cwd: state.cwd,
        timeout: LINT_TIMEOUT_MS,
        recordHistory: false,
        onStdout: (data) => this.emitTerminal(missionId, "stdout", data),
        onStderr: (data) => this.emitTerminal(missionId, "stderr", data),
        onPrompt: async () => true,
      });
      const passed = result.exitCode === 0;
      const errorCount = this.countLintErrors(result.stdout, result.stderr);
      const summary = passed
        ? "0 lint errors (exit 0)"
        : `${errorCount} lint error${errorCount === 1 ? "" : "s"} (exit ${result.exitCode})`;

      this.emitResult(missionId, "lint-check", passed, `${detail} → ${summary}`);

      return {
        name: "lint",
        passed,
        detail: summary,
        durationMs: now() - start,
        timestamp: start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitResult(missionId, "lint-check", false, `${detail} → ${msg}`);
      return {
        name: "lint",
        passed: false,
        detail: truncate(msg, 200),
        durationMs: now() - start,
        timestamp: start,
      };
    }
  }

  /** 4. Review: invoke code-reviewer agent on the modified files. */
  private async runReviewCheck(
    missionId: string,
    state: MissionState,
  ): Promise<QualityCheck> {
    const start = now();
    const modified = state.filesModified.slice(-25); // cap to keep prompt small
    this.emitActing(
      missionId,
      "review-check",
      `Reviewing ${modified.length} modified file${modified.length === 1 ? "" : "s"}`,
    );

    if (modified.length === 0) {
      const detail = "No files modified — review skipped";
      this.emitResult(missionId, "review-check", true, detail);
      return {
        name: "review",
        passed: true,
        score: 100,
        detail,
        durationMs: now() - start,
        timestamp: start,
      };
    }

    // Read each modified file (skip missing/unreadable ones).
    const reviewFiles: { path: string; content: string }[] = [];
    for (const filePath of modified) {
      try {
        const resolved = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(state.cwd, filePath);
        const exists = await fileExists(resolved);
        if (!exists) continue;
        const content = await readFile(resolved);
        reviewFiles.push({
          path: resolved,
          content: truncate(content, 6_000),
        });
      } catch {
        // Skip unreadable files — the reviewer doesn't need every file.
      }
    }

    if (reviewFiles.length === 0) {
      const detail = "Could not read any modified files for review";
      this.emitResult(missionId, "review-check", false, detail);
      return {
        name: "review",
        passed: false,
        score: 0,
        detail,
        durationMs: now() - start,
        timestamp: start,
      };
    }

    // Build a Task for the code-reviewer agent.
    const task: Task = {
      id: `quality_review_${missionId}_${start}`,
      kind: "review",
      title: `Quality-gate review of ${reviewFiles.length} files`,
      description: "Phase I quality-gate code review",
      priority: "high",
      status: "running",
      assignedAgent: "code-reviewer",
      dependencies: [],
      input: {
        files: reviewFiles,
        provider: this.provider,
      },
      createdAt: start,
      startedAt: start,
      attempts: 1,
      maxAttempts: 1,
      timeoutMs: REVIEW_TIMEOUT_MS,
      progress: 0,
      subtaskIds: [],
    };

    let result: TaskResult;
    const entry = agentRegistry.get("code-reviewer");
    if (!entry) {
      const detail = "Code-reviewer agent not registered — skipping review";
      this.emitResult(missionId, "review-check", false, detail);
      return {
        name: "review",
        passed: false,
        score: 0,
        detail,
        durationMs: now() - start,
        timestamp: start,
      };
    }

    // Race the agent against a hard timeout so a hung review can't stall
    // the entire quality gate.
    const timeoutController = new AbortController();
    const timer = setTimeout(
      () => timeoutController.abort(),
      REVIEW_TIMEOUT_MS,
    );
    try {
      result = await entry.execute(
        task,
        timeoutController.signal,
        () => {
          /* swallow per-agent progress — the gate emits its own events */
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        data: null,
        summary: `Code reviewer threw: ${msg}`,
        artifacts: [],
      };
    } finally {
      clearTimeout(timer);
    }

    const score = this.extractReviewScore(result);
    const passed = score >= this.thresholds.reviewScore;
    const summary =
      typeof result.summary === "string" && result.summary.length > 0
        ? truncate(result.summary, 200)
        : `Score ${score}/100`;

    this.emitResult(
      missionId,
      "review-check",
      passed,
      `Code review → ${summary} (score ${score}/100)`,
    );

    return {
      name: "review",
      passed,
      score,
      detail: summary,
      durationMs: now() - start,
      timestamp: start,
    };
  }

  /** 5. Confidence: check confidenceTracker. Pass iff ≥ threshold. */
  private runConfidenceCheck(
    missionId: string,
    state: MissionState,
  ): QualityCheck {
    const start = now();
    const score = confidenceTracker.getFor(missionId);
    const passed = score >= this.thresholds.confidence;
    const detail = `Executive confidence ${score}%`;

    this.emitActing(missionId, "confidence-check", `Checking confidence: ${score}%`);
    this.emitResult(
      missionId,
      "confidence-check",
      passed,
      `Confidence → ${detail} (need ${this.thresholds.confidence}%)`,
    );

    return {
      name: "confidence",
      passed,
      score,
      detail,
      durationMs: now() - start,
      timestamp: start,
    };
  }

  // ── Score aggregation ──────────────────────────────────────────────────
  /**
   * Compute the overall 0-100 score as a weighted average of the scored
   * checks (tests, review, confidence). Boolean checks (build, lint)
   * contribute 100 when passed, 0 when failed.
   */
  private computeOverallScore(checks: QualityCheck[]): number {
    const weights: Record<string, number> = {
      build: 25,
      tests: 25,
      lint: 15,
      review: 20,
      confidence: 15,
    };
    let total = 0;
    let weightSum = 0;
    for (const check of checks) {
      const w = weights[check.name] ?? 0;
      if (w === 0) continue;
      const score =
        typeof check.score === "number"
          ? check.score
          : check.passed
            ? 100
            : 0;
      total += score * w;
      weightSum += w;
    }
    if (weightSum === 0) return 0;
    return Math.round(total / weightSum);
  }

  // ── Output parsers ─────────────────────────────────────────────────────

  /** Count "error TSxxxx:" lines in tsc output. */
  private countTsErrors(stdout: string, stderr: string): number {
    const text = `${stdout}\n${stderr}`;
    const matches = text.match(/error TS\d+:/g);
    return matches ? matches.length : 0;
  }

  /** Count ESLint error lines. Looks for "X error" / "Y problem" summaries. */
  private countLintErrors(stdout: string, stderr: string): number {
    const text = `${stdout}\n${stderr}`;
    // ESLint summary line: "✖ N problems (M errors, W warnings)"
    const summary = text.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?/i);
    if (summary) {
      return parseInt(summary[2], 10);
    }
    // Per-line error: "  N:M  error  ..."
    const lineMatches = text.match(/^\s*\d+:\d+\s+error\s/mg);
    return lineMatches ? lineMatches.length : 0;
  }

  /** Extract the numeric review score from a code-reviewer TaskResult. */
  private extractReviewScore(result: TaskResult): number {
    if (result.metrics && typeof result.metrics.score === "number") {
      return Math.max(0, Math.min(100, Math.round(result.metrics.score)));
    }
    if (
      result.data &&
      typeof result.data === "object" &&
      "score" in result.data &&
      typeof (result.data as { score?: unknown }).score === "number"
    ) {
      const score = (result.data as { score: number }).score;
      return Math.max(0, Math.min(100, Math.round(score)));
    }
    // No score available — treat as a 50/100 (neutral) review.
    return result.success ? 80 : 30;
  }

  // ── Mission event emission ─────────────────────────────────────────────
  private emitActing(
    missionId: string,
    agent: string,
    action: string,
  ): void {
    const t = now();
    missionEmitter.emit({
      type: "agent:acting",
      missionId,
      agent,
      action,
      timestamp: t,
    });
    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent,
      status: "acting",
      detail: action,
      timestamp: t,
    });
  }

  private emitResult(
    missionId: string,
    agent: string,
    success: boolean,
    summary: string,
  ): void {
    const t = now();
    missionEmitter.emit({
      type: "agent:result",
      missionId,
      agent,
      success,
      summary: truncate(summary, 280),
      timestamp: t,
    });
    missionEmitter.emit({
      type: "agent:status",
      missionId,
      agent,
      status: success ? "done" : "error",
      detail: truncate(summary, 200),
      timestamp: t,
    });
  }

  private emitTerminal(
    missionId: string,
    stream: "stdout" | "stderr",
    data: string,
  ): void {
    if (!data) return;
    missionEmitter.emit({
      type: "terminal:output",
      missionId,
      stream,
      data,
      timestamp: now(),
    });
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────
export const qualityGate = new QualityGate();
