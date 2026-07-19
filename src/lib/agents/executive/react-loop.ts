// CodeInsight AI — ReAct Loop Engine
// Phase A: The Observe → Think → Act → Verify → Reflect → Decide loop.
//
// Each iteration:
//   1. OBSERVE   — snapshot current mission state (files, errors, memory)
//   2. THINK     — call AI with goal + state + tools + history → ThinkResponse
//   3. ACT       — execute the chosen tool via executeTool()
//   4. VERIFY    — check the result, update memory, record tool call
//   5. REFLECT   — if error, analyze why; if success, update confidence
//   6. DECIDE    — stop when is_complete OR confidence > 85 OR max iters
//
// The loop never throws — failures are converted into MissionEvents so the
// UI keeps streaming. The mission is marked `failed` only if too many
// consecutive errors accumulate or the AI cannot be reached.

import * as path from "path";
import { callAIForJSON } from "@/lib/agents/ai-client";
import type { AIProviderConfig, AIMessage } from "@/lib/agents/ai-client";
import { executeTool, formatToolsForAI, type ToolContext } from "./tool-registry";
import { toolSelector, type ToolSelectionContext } from "./tool-selector";
import { toolCache } from "./tool-cache";
import type { ToolCallResult } from "./types";
import { missionEmitter } from "./event-emitter";
import { reflectionAgent } from "./reflection-agent";
import type {
  ReflectionRecentEvent,
  ReflectionResult,
} from "./reflection-agent";
import { confidenceTracker } from "./confidence";
import { Replanner } from "./replanner";
import { RollbackManager } from "./rollback";
import { debateOrchestrator } from "./debate";
import { detectTopic } from "./consensus";
import {
  isThinkResponse,
  type ExecutiveDecision,
  type MissionContext,
  type MissionEvent,
  type MissionState,
  type ReActPhase,
  type ThinkResponse,
  type ToolCall,
} from "./types";

// ── ReAct loop options ──────────────────────────────────────────────────────
export interface ReActLoopOptions {
  maxIterations?: number;
  provider?: AIProviderConfig;
  /** Confidence threshold above which the loop stops (default 85). */
  confidenceThreshold?: number;
  /** Number of consecutive tool errors after which the mission is failed. */
  maxConsecutiveErrors?: number;
  /** Phase E: max replan attempts before the mission is failed (default 5). */
  maxRevisions?: number;
  /** Phase E: confidence-drop threshold (points) that triggers auto-rollback
   *  after a successful action (default 25). */
  rollbackConfidenceDrop?: number;
}

// ── Default fallback provider (used when none is supplied) ──────────────────
const DEFAULT_PROVIDER: AIProviderConfig = {
  providerId: "zai",
  apiKey: process.env.ZAI_API_KEY || "",
  baseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4",
  model: process.env.ZAI_MODEL || "glm-4.6",
  temperature: 0.3,
  maxTokens: 4096,
};

// ── Phase transition helper ─────────────────────────────────────────────────
function setPhase(ctx: MissionContext, phase: ReActPhase): void {
  ctx.updateState({ currentPhase: phase });
  ctx.emit({
    type: "react:phase",
    missionId: ctx.missionId,
    phase,
    iteration: ctx.getState().iteration,
    timestamp: Date.now(),
  });
}

// ── Sleep helper that respects abort ────────────────────────────────────────
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ── Build the AI prompt for the THINK phase ─────────────────────────────────
function buildThinkPrompt(
  goal: string,
  state: MissionState,
  recentHistory: ToolCall[],
  reflectionHint?: string,
  selectionContext?: ToolSelectionContext,
): string {
  const filesModified =
    state.filesModified.length > 0
      ? state.filesModified.slice(-15).join(", ")
      : "(none yet)";
  const knownIssues =
    state.memory.knownIssues.length > 0
      ? state.memory.knownIssues.slice(-10).map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(none)";
  const memorySummary = [
    `keyFiles: ${state.memory.keyFiles.size} entries`,
    `architectureNotes: ${state.memory.architectureNotes.length}`,
    `attemptedFixes: ${state.memory.attemptedFixes.length}`,
    `conventions: ${state.memory.conventions.length}`,
  ].join(" | ");

  const historyLines =
    recentHistory.length > 0
      ? recentHistory
          .map(
            (h) =>
              `  - [${h.success ? "OK" : "FAIL"}] ${h.tool}(${JSON.stringify(h.args).slice(0, 200)}) → ${typeof h.result === "string" ? h.result.slice(0, 200) : JSON.stringify(h.result).slice(0, 200)}`,
          )
          .join("\n")
      : "  (no actions yet)";

  const reflectionSection =
    reflectionHint && reflectionHint.trim().length > 0
      ? `\n\nPREVIOUS REFLECTION SUGGESTED:\n${reflectionHint.trim()}\n`
      : "";

  // Phase D: surface only the top-relevance tools to the AI. If no selection
  // context is supplied (e.g. legacy callers), fall back to the full catalog.
  const toolsSection = selectionContext
    ? toolSelector.formatRankedToolsForAI(selectionContext)
    : formatToolsForAI();

  // Phase D: when the selector recognizes a complex multi-step goal, suggest
  // a tool chain so the AI can plan its iteration sequence.
  let compositionSection = "";
  if (selectionContext) {
    const composition = toolSelector.suggestComposition(goal, selectionContext);
    if (composition) {
      compositionSection = `\n\nSUGGESTED TOOL CHAIN (for this kind of goal):\n${composition.tools.join(" → ")}\nReason: ${composition.reason}\n`;
    }
  }

  return `You are an Executive Agent coordinating a software engineering mission.

GOAL: ${goal}
ITERATION: ${state.iteration}/${state.maxIterations}
CONFIDENCE: ${state.confidence}%

CURRENT STATE:
- Files modified: ${filesModified}
- Build status: ${state.buildStatus ?? "pending"}
- Test status: ${state.testStatus ?? "pending"}
- Known issues:
${knownIssues}
- Memory: ${memorySummary}

AVAILABLE TOOLS (ranked by relevance to the current context):
${toolsSection}${compositionSection}

RECENT HISTORY (last ${recentHistory.length} actions):
${historyLines}${reflectionSection}

Based on the above, decide your next action. Return JSON ONLY (no prose):
{
  "reasoning": "why I'm doing this",
  "next_action": "description of what I'll do",
  "tool": "tool_name from AVAILABLE TOOLS",
  "tool_args": { ... },
  "confidence": 0-100,
  "is_complete": false
}`;
}

// ── Coerce the raw AI JSON into a ThinkResponse ─────────────────────────────
function coerceThinkResponse(raw: unknown): ThinkResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI did not return an object");
  }
  const r = raw as Record<string, unknown>;
  const confidence =
    typeof r.confidence === "number"
      ? Math.max(0, Math.min(100, r.confidence))
      : typeof r.confidence === "string"
        ? Math.max(0, Math.min(100, parseInt(r.confidence, 10) || 0))
        : 50;
  const tool = typeof r.tool === "string" ? r.tool : "";
  const reasoning = typeof r.reasoning === "string" ? r.reasoning : "";
  const next_action = typeof r.next_action === "string" ? r.next_action : "";
  const tool_args =
    r.tool_args && typeof r.tool_args === "object" && !Array.isArray(r.tool_args)
      ? (r.tool_args as Record<string, unknown>)
      : {};
  const is_complete = r.is_complete === true || r.is_complete === "true";
  return { reasoning, next_action, tool, tool_args, confidence, is_complete };
}

// ── Main loop class ─────────────────────────────────────────────────────────
export class ReActLoop {
  private readonly missionId: string;
  private readonly maxIterations: number;
  private readonly provider: AIProviderConfig;
  private readonly confidenceThreshold: number;
  private readonly maxConsecutiveErrors: number;
  /** Phase E: dynamic replanner for when the plan goes off-track. */
  private readonly replanner: Replanner;
  /** Phase E: snapshot-and-restore manager for destructive actions. */
  private readonly rollbackManager: RollbackManager;
  /** Phase E: confidence-drop threshold (points) that triggers auto-rollback. */
  private readonly rollbackConfidenceDrop: number;
  private consecutiveErrors = 0;
  /** Last proposed action from Reflection — fed back into the next Think phase. */
  private lastProposedAction: string | null = null;
  /** Set to true when Reflection requested a replan; used after loop exit. */
  private requestedReplan = false;
  /** Phase E: consecutive tool-execution failures (resets on any success). */
  private consecutiveToolFailures = 0;
  /** Phase E: snapshot id taken before the most recent destructive action
   *  in the current iteration. `null` if no snapshot was taken this iter. */
  private lastSnapshotId: string | null = null;

  constructor(missionId: string, options: ReActLoopOptions = {}) {
    this.missionId = missionId;
    this.maxIterations = options.maxIterations ?? 25;
    this.provider = options.provider ?? DEFAULT_PROVIDER;
    this.confidenceThreshold = options.confidenceThreshold ?? 85;
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 5;
    this.replanner = new Replanner(options.maxRevisions ?? 5);
    this.rollbackManager = new RollbackManager();
    this.rollbackConfidenceDrop = options.rollbackConfidenceDrop ?? 25;
  }

  async run(goal: string, context: MissionContext): Promise<MissionState> {
    const ctx = context;
    ctx.updateState({ status: "executing", maxIterations: this.maxIterations });
    // Phase E: ensure the confidence tracker points at this mission so the
    // Reflection Agent's adjustFor() calls land in the right place.
    confidenceTracker.setActive(this.missionId);

    let iteration = 0;
    let lastDecision: ExecutiveDecision | null = null;

    try {
      while (iteration < this.maxIterations) {
        if (ctx.signal.aborted) {
          ctx.updateState({ status: "cancelled" });
          break;
        }

        iteration++;
        // Phase E: reset per-iteration snapshot tracking. A snapshot is only
        // valid for the iteration it was taken in — we never roll back to a
        // snapshot from a previous iteration.
        this.lastSnapshotId = null;
        ctx.updateState({ iteration, currentPhase: "observe" });
        this.emitPhase(ctx, "observe", iteration);

        // ── 1. OBSERVE ─────────────────────────────────────────────────────
        const state = ctx.getState();
        this.emitAgentThinking(ctx, `Observing state for iteration ${iteration}`);

        // ── 2. THINK ──────────────────────────────────────────────────────
        setPhase(ctx, "think");
        this.emitAgentThinking(
          ctx,
          `Deciding next action (confidence ${state.confidence}%)`,
        );

        let think: ThinkResponse;
        try {
          think = await this.think(goal, state, this.lastProposedAction);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitError(ctx, `Think phase failed: ${msg}`, true);
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            ctx.updateState({ status: "failed" });
            state.errors.push(`Think phase failed ${this.consecutiveErrors}x: ${msg}`);
            break;
          }
          // Brief backoff then retry the next iteration.
          await delay(500, ctx.signal).catch(() => undefined);
          continue;
        }

        // Record the decision regardless of whether the tool succeeds.
        lastDecision = {
          id: missionEmitter.nextId("decision"),
          iteration,
          phase: "think",
          reasoning: think.reasoning,
          action: think.next_action,
          confidence: think.confidence,
          timestamp: Date.now(),
        };
        ctx.recordDecision(lastDecision);

        // ── DECIDE (early exit) ───────────────────────────────────────────
        setPhase(ctx, "decide");
        if (
          think.is_complete ||
          (think.confidence >= this.confidenceThreshold &&
            state.toolHistory.length > 0)
        ) {
          this.emitAgentThinking(
            ctx,
            think.is_complete
              ? `Mission marked complete by AI (confidence ${think.confidence}%).`
              : `Confidence threshold reached (${think.confidence}%). Stopping.`,
            think.confidence,
          );
          ctx.updateState({ status: "verifying" });
          break;
        }

        // If AI returned no tool, treat as a no-op and reflect.
        if (!think.tool) {
          this.emitError(
            ctx,
            "AI returned no tool name. Reflecting and retrying.",
            true,
          );
          this.consecutiveErrors++;
          continue;
        }
        this.consecutiveErrors = 0;

        // ── Phase E: Pre-Act snapshot ────────────────────────────────────
        // If the chosen tool is destructive (edit_file or run_command with
        // write semantics), snapshot the files that may be affected so we
        // can auto-rollback if the fix makes things worse.
        if (this.isDestructive(think.tool, think.tool_args)) {
          const filesToSnapshot = this.filesPotentiallyAffected(
            think.tool,
            think.tool_args,
            ctx.getState(),
          );
          if (filesToSnapshot.length > 0) {
            try {
              this.lastSnapshotId = await this.rollbackManager.snapshot(
                this.missionId,
                `Before ${think.tool}: ${think.next_action.slice(0, 80)}`,
                filesToSnapshot,
                {
                  confidence: ctx.getState().confidence,
                  iteration,
                  subGoals: ctx.getState().subGoals,
                },
                ctx.getState().confidence,
              );
              ctx.updateState({ lastSnapshotId: this.lastSnapshotId });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.emitError(
                ctx,
                `Snapshot failed (continuing without rollback safety): ${msg}`,
                true,
              );
              this.lastSnapshotId = null;
            }
          }
        }

        // ── 3. ACT ────────────────────────────────────────────────────────
        setPhase(ctx, "act");

        // Phase D: validate tool args before execution. If invalid, surface
        // the error and continue the loop without consuming a tool-call slot.
        const validation = toolSelector.validateArgs(think.tool, think.tool_args);
        if (!validation.valid) {
          this.emitError(
            ctx,
            `Tool arg validation failed for ${think.tool}: ${validation.errors.join("; ")}`,
            true,
          );
          this.consecutiveErrors++;
          ctx.getState().errors.push(
            `Arg validation: ${think.tool}: ${validation.errors.join("; ")}`,
          );
          continue;
        }

        // Phase D: check whether this tool call requires human approval.
        // (For now we auto-approve but emit a thinking event so the UI shows
        //  that a sensitive operation is about to run — wiring in an actual
        //  approval gate is a Phase H task.)
        const cwd = ctx.getState().cwd;
        const needsApproval = toolSelector.requiresApproval(
          think.tool,
          think.tool_args,
          cwd,
        );
        if (needsApproval) {
          this.emitAgentThinking(
            ctx,
            `⚠ Tool ${think.tool} requires approval (auto-approved). Args: ${JSON.stringify(think.tool_args).slice(0, 160)}`,
          );
        }

        // Phase D: check the result cache before executing.
        const cachedRaw = toolCache.get(this.missionId, think.tool, think.tool_args);
        const cachedResult =
          cachedRaw !== null && this.isCachedResult(cachedRaw) ? cachedRaw : null;
        const cacheHit = cachedResult !== null;
        let toolResult: ToolCallResult;
        if (cacheHit) {
          toolResult = cachedResult;
          this.emitAgentThinking(
            ctx,
            `Cache hit for ${think.tool} — using cached result (skipping execution).`,
          );
        } else {
          this.emitAgentActing(
            ctx,
            think.tool,
            `${think.next_action} — args: ${JSON.stringify(think.tool_args).slice(0, 200)}`,
          );

          const toolCtx: ToolContext = {
            missionId: this.missionId,
            cwd,
            signal: ctx.signal,
            provider: this.provider,
            emitTerminal: (stream, data) =>
              ctx.recordTerminalOutput(stream, data),
            emitFileChange: (p, action, additions, deletions) =>
              ctx.recordFileChange(p, action, additions, deletions),
          };

          toolResult = await executeTool(think.tool, think.tool_args, toolCtx);

          // Phase D: cache the fresh result if the tool is cacheable.
          if (toolResult.success && toolCache.isCacheable(think.tool)) {
            toolCache.set(
              this.missionId,
              think.tool,
              think.tool_args,
              toolResult,
            );
          }

          // Phase D: edit_file invalidates any cached reads of that path so
          // the next read_file reflects the new content.
          if (
            think.tool === "edit_file" &&
            typeof think.tool_args.path === "string" &&
            think.tool_args.path
          ) {
            const editedPath = path.isAbsolute(think.tool_args.path)
              ? think.tool_args.path
              : path.resolve(cwd, think.tool_args.path);
            toolCache.invalidateFile(this.missionId, editedPath);
          }
        }

        // Phase D: metadata to surface cache hit/miss + approval status.
        const toolMeta: Record<string, unknown> = {
          cached: cacheHit,
          requiresApproval: needsApproval,
        };
        const cacheStats = toolCache.getStats(this.missionId);
        toolMeta.cacheHits = cacheStats.hits;
        toolMeta.cacheMisses = cacheStats.misses;

        const toolDuration = cacheHit ? 0 : toolResult.durationMs;

        const toolCall: ToolCall = {
          id: missionEmitter.nextId("tool"),
          tool: think.tool,
          args: think.tool_args,
          result: toolResult.output,
          timestamp: Date.now(),
          success: toolResult.success,
          durationMs: toolDuration,
          error: toolResult.error,
          meta: toolMeta,
        };

        // ── 4. VERIFY ─────────────────────────────────────────────────────
        setPhase(ctx, "verify");
        ctx.recordToolCall(toolCall);

        if (toolResult.success) {
          this.emitAgentResult(ctx, true, `${think.tool} succeeded in ${toolDuration}ms`);
          // Phase E: reset the consecutive-tool-failure counter on any success.
          this.consecutiveToolFailures = 0;
          // Update memory with what we learned from this tool call.
          this.assimilateMemory(ctx, think.tool, toolResult.output);
        } else {
          this.emitAgentResult(ctx, false, `${think.tool} failed: ${toolResult.error ?? "unknown error"}`);
          // Phase E: track consecutive tool failures as a replan trigger.
          this.consecutiveToolFailures++;
          ctx.getState().errors.push(`${think.tool}: ${toolResult.error ?? "failed"}`);
        }

        // ── 5. REFLECT ────────────────────────────────────────────────────
        setPhase(ctx, "reflect");

        // Phase E: capture confidence BEFORE the reflection runs, since the
        // Reflection Agent calls confidenceTracker.adjustFor() which mutates
        // state.confidence. We need the pre-reflection value to detect
        // significant drops that warrant an auto-rollback.
        const confidenceBefore = ctx.getState().confidence;

        // Make sure the ConfidenceTracker is pointing at this mission.
        confidenceTracker.setActive(this.missionId);

        const recentEvent: ReflectionRecentEvent = {
          action: think.next_action,
          tool: think.tool,
          result: toolResult.output,
          success: toolResult.success,
          error: toolResult.error,
        };

        let reflection: ReflectionResult;
        try {
          reflection = await reflectionAgent.reflect(
            this.missionId,
            ctx.getState(),
            recentEvent,
            this.provider,
            ctx.signal,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitError(ctx, `Reflection failed: ${msg}`, true);
          reflection = {
            analysis: `Reflection failed: ${msg}`,
            rootCause: msg,
            severity: "warning",
            proposedAction: "Continue with the next planned step.",
            confidenceAdjustment: 0,
            shouldRetry: false,
            shouldReplan: false,
            memoryUpdate: [],
          };
        }

        // Feed the proposed action back into the next Think phase if a retry is suggested.
        this.lastProposedAction =
          reflection.shouldRetry && reflection.proposedAction
            ? reflection.proposedAction
            : null;

        // Emit a decision event capturing the reflection's analysis so the
        // UI can stream it in real time.
        const reflectionDecision: ExecutiveDecision = {
          id: missionEmitter.nextId("decision"),
          iteration,
          phase: "reflect",
          reasoning: reflection.analysis,
          action: reflection.proposedAction,
          confidence: ctx.getState().confidence,
          timestamp: Date.now(),
        };
        ctx.recordDecision(reflectionDecision);

        // ── Phase E: Dynamic Replanning ──────────────────────────────────
        // If the Reflection Agent says the plan itself is wrong, OR we've
        // hit multiple consecutive tool failures, ask the Replanner for a
        // revised plan and continue the loop with the new sub-goals (instead
        // of breaking out and leaving the mission in `planning` status).
        const shouldReplan =
          (reflection.shouldReplan || this.consecutiveToolFailures >= 2) &&
          this.replanner.canReplan(this.missionId);

        if (shouldReplan) {
          const replanReason = reflection.shouldReplan
            ? `Reflection Agent signaled shouldReplan (${reflection.rootCause || reflection.analysis.slice(0, 80)})`
            : `${this.consecutiveToolFailures} consecutive tool failures`;
          this.emitAgentThinking(
            ctx,
            `Replanning due to: ${replanReason}`,
            ctx.getState().confidence,
          );
          const revision = await this.replanner.replan(
            this.missionId,
            ctx.getState(),
            {
              action: think.next_action,
              error:
                toolResult.error ??
                reflection.rootCause ??
                "no error (plan-level issue)",
              iteration,
            },
            this.provider,
            ctx.signal,
          );
          if (revision === null) {
            // Max revisions exceeded — end the mission.
            ctx.getState().errors.push("Max replanning attempts exceeded");
            this.emitError(
              ctx,
              "Max replanning attempts exceeded — giving up.",
              false,
            );
            ctx.updateState({ status: "failed" });
            break;
          }
          // Apply the revised plan to mission state so the next THINK
          // prompt sees the new sub-goals.
          ctx.updateState({
            subGoals: revision.newSubGoals,
            revisionCount: revision.revisionNumber,
          });
          // Reset the tool-failure counter so we don't immediately replan
          // again on the next iteration.
          this.consecutiveToolFailures = 0;
          // Remember that we replanned at least once for post-loop reporting.
          this.requestedReplan = false;
        } else if (reflection.shouldReplan && !this.replanner.canReplan(this.missionId)) {
          // Reflection wants to replan but we've exhausted the budget — fail.
          ctx.getState().errors.push(
            `Replan requested at iteration ${iteration} but revision budget exhausted: ${
              reflection.rootCause || reflection.analysis
            }`,
          );
          this.emitError(
            ctx,
            "Replan requested but revision budget exhausted — giving up.",
            false,
          );
          ctx.updateState({ status: "failed" });
          break;
        }

        // ── Phase E: Auto-Rollback ───────────────────────────────────────
        // If a successful action made confidence drop significantly
        // (>= rollbackConfidenceDrop points), restore the pre-action file
        // state. This catches the case where a fix looked good to the AI
        // but actually broke something downstream.
        const currentConfidence = ctx.getState().confidence;
        const confidenceDelta = currentConfidence - confidenceBefore;
        if (
          toolResult.success &&
          this.lastSnapshotId &&
          confidenceDelta <= -this.rollbackConfidenceDrop &&
          this.rollbackManager.canRollback(this.missionId)
        ) {
          this.emitAgentThinking(
            ctx,
            `Auto-rollback triggered: confidence dropped ${-confidenceDelta}pts (from ${confidenceBefore}% to ${currentConfidence}%) after a successful action. Restoring previous state.`,
            confidenceBefore,
          );
          const rolled = await this.rollbackManager.rollback(
            this.missionId,
            this.lastSnapshotId,
          );
          if (rolled) {
            // Restore confidence to the pre-action value.
            confidenceTracker.setFor(
              this.missionId,
              confidenceBefore,
              `Auto-rollback restored confidence to pre-action value (${confidenceBefore}%).`,
            );
          }
        }

        // ── Phase C: Auto-Debate Trigger ──────────────────────────────────
        // When the mission is stuck (low confidence + repeated tool failures
        // OR the Reflection Agent says the plan is wrong), automatically
        // trigger a multi-agent debate to break the impasse. The debate cap
        // (5 per mission) is enforced inside the orchestrator, so this call
        // is safe to attempt every iteration.
        await this.maybeAutoDebate(ctx, think, toolResult, reflection);

        // ── 6. DECIDE (continue loop) ─────────────────────────────────────
        // Already emitted `react:phase` for decide above for the early-exit
        // case. Here we just continue to the next iteration.
      }

      // Loop ended — finalize.
      if (!ctx.signal.aborted && ctx.getState().status !== "failed") {
        if (this.requestedReplan) {
          // Reflection flagged that the plan itself is wrong — leave the
          // mission in `planning` so the caller can revise.
          ctx.updateState({ status: "planning", currentPhase: "decide" });
        } else {
          ctx.updateState({ status: "completed", currentPhase: "decide" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.getState().errors.push(`ReAct loop crashed: ${msg}`);
      this.emitError(ctx, `ReAct loop crashed: ${msg}`, false);
      ctx.updateState({ status: "failed" });
    }

    return ctx.getState();
  }

  // ── Phase emission helpers ───────────────────────────────────────────────
  private emitPhase(ctx: MissionContext, phase: ReActPhase, iteration: number): void {
    const evt: MissionEvent = {
      type: "react:phase",
      missionId: this.missionId,
      phase,
      iteration,
      timestamp: Date.now(),
    };
    ctx.emit(evt);
  }

  private emitAgentThinking(
    ctx: MissionContext,
    message: string,
    confidence?: number,
  ): void {
    ctx.emit({
      type: "agent:thinking",
      missionId: this.missionId,
      agent: "executive",
      message,
      confidence,
      timestamp: Date.now(),
    });
    ctx.emit({
      type: "agent:status",
      missionId: this.missionId,
      agent: "executive",
      status: "thinking",
      detail: message,
      timestamp: Date.now(),
    });
  }

  private emitAgentActing(
    ctx: MissionContext,
    tool: string,
    detail: string,
  ): void {
    ctx.emit({
      type: "agent:acting",
      missionId: this.missionId,
      agent: "executive",
      action: tool,
      detail,
      timestamp: Date.now(),
    });
    ctx.emit({
      type: "agent:status",
      missionId: this.missionId,
      agent: "executive",
      status: "acting",
      detail,
      timestamp: Date.now(),
    });
  }

  private emitAgentResult(
    ctx: MissionContext,
    success: boolean,
    summary: string,
  ): void {
    ctx.emit({
      type: "agent:result",
      missionId: this.missionId,
      agent: "executive",
      success,
      summary,
      timestamp: Date.now(),
    });
    ctx.emit({
      type: "agent:status",
      missionId: this.missionId,
      agent: "executive",
      status: success ? "done" : "error",
      detail: summary,
      timestamp: Date.now(),
    });
  }

  private emitError(
    ctx: MissionContext,
    message: string,
    recoverable: boolean,
  ): void {
    ctx.emit({
      type: "error",
      missionId: this.missionId,
      message,
      recoverable,
      timestamp: Date.now(),
    });
  }

  // ── Call the AI for the THINK phase ──────────────────────────────────────
  private async think(
    goal: string,
    state: MissionState,
    reflectionHint?: string | null,
  ): Promise<ThinkResponse> {
    const recentHistory = state.toolHistory.slice(-5);

    // Phase D: build a tool-selection context from mission state so the
    // selector can rank tools by relevance to the current situation.
    const selectionContext: ToolSelectionContext = {
      goal,
      currentPhase: state.currentPhase,
      recentActions: state.toolHistory.map((t) => t.tool),
      knownIssues: state.memory.knownIssues,
      filesModified: state.filesModified,
      memorySummary: [
        `keyFiles=${state.memory.keyFiles.size}`,
        `archNotes=${state.memory.architectureNotes.length}`,
        `attempted=${state.memory.attemptedFixes.length}`,
      ].join(" "),
      errorContext:
        state.errors.length > 0
          ? state.errors[state.errors.length - 1]
          : undefined,
    };

    const prompt = buildThinkPrompt(
      goal,
      state,
      recentHistory,
      reflectionHint ?? undefined,
      selectionContext,
    );

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are the Executive Agent of CodeInsight AI. You autonomously complete software engineering missions by choosing tools, executing them, and verifying results. Always respond with valid JSON only — no markdown, no prose.",
      },
      { role: "user", content: prompt },
    ];

    const raw = await callAIForJSON<unknown>(this.provider, messages, {
      temperature: 0.3,
      maxTokens: 1024,
      signal: state !== null ? undefined : undefined, // signal passed via provider call below
    });

    // callAIForJSON doesn't accept signal in current signature; rely on
    // outer ctx.signal via the AbortController of the calling task.
    const coerced = coerceThinkResponse(raw);
    if (!isThinkResponse(coerced)) {
      throw new Error("AI response did not match ThinkResponse schema");
    }
    return coerced;
  }

  // ── Memory assimilation ──────────────────────────────────────────────────
  private assimilateMemory(
    ctx: MissionContext,
    tool: string,
    output: unknown,
  ): void {
    if (!output || typeof output !== "object") return;
    const o = output as Record<string, unknown>;

    if (tool === "list_files") {
      const files = Array.isArray(o.files) ? (o.files as unknown[]) : [];
      const structure = files
        .filter((f): f is string => typeof f === "string")
        .slice(0, 200);
      if (structure.length > 0) {
        ctx.updateMemory({ repositoryStructure: structure });
      }
      return;
    }

    if (tool === "read_file") {
      const filePath = typeof o.path === "string" ? o.path : "";
      const content = typeof o.content === "string" ? o.content : "";
      if (filePath) {
        // Store a short summary (first non-empty 200 chars).
        const summary = content.slice(0, 200).replace(/\s+/g, " ").trim();
        const keyFiles = new Map<string, string>();
        keyFiles.set(filePath, summary || "(empty)");
        ctx.updateMemory({ keyFiles });
      }
      return;
    }

    if (tool === "git_status") {
      const untracked = Array.isArray(o.untracked) ? (o.untracked as unknown[]) : [];
      const staged = Array.isArray(o.staged) ? (o.staged as unknown[]) : [];
      const unstaged = Array.isArray(o.unstaged) ? (o.unstaged as unknown[]) : [];
      if (untracked.length + staged.length + unstaged.length > 0) {
        const knownIssues = [...ctx.getState().memory.knownIssues];
        knownIssues.push(
          `Working tree has ${untracked.length} untracked, ${staged.length} staged, ${unstaged.length} unstaged files`,
        );
        ctx.updateMemory({ knownIssues: knownIssues.slice(-15) });
      }
      return;
    }

    if (tool === "invoke_agent") {
      // If the agent returned a summary, capture it as an architecture note.
      const summary = typeof o.summary === "string" ? o.summary : "";
      if (summary) {
        const notes = [...ctx.getState().memory.architectureNotes];
        notes.push(
          `[${typeof o.agentId === "string" ? o.agentId : "agent"}] ${summary.slice(0, 300)}`,
        );
        ctx.updateMemory({ architectureNotes: notes.slice(-20) });
      }
      return;
    }

    // For other tools, no special assimilation — the AI sees raw output.
  }

  // ── Phase C: Auto-debate trigger ──────────────────────────────────────────
  /**
   * If the mission is stuck (low confidence + repeated failures OR the
   * Reflection Agent says the plan itself is wrong), automatically trigger a
   * multi-agent debate to break the impasse. The debate winner + reasoning
   * is fed back into the next Think phase via `lastProposedAction` so the
   * Executive considers the debate outcome before its next move.
   *
   * Conditions (all must hold):
   *   - Confidence < 50%
   *   - AND (reflection.shouldReplan OR consecutiveToolFailures >= 2 OR
   *          last tool failed with a non-trivial error)
   *   - AND a debate cap slot is available (orchestrator enforces this)
   *   - AND a provider is configured
   *
   * Never throws — failures degrade silently (the loop continues normally).
   */
  private async maybeAutoDebate(
    ctx: MissionContext,
    think: ThinkResponse,
    toolResult: { success: boolean; error?: string; output: unknown },
    reflection: ReflectionResult,
  ): Promise<void> {
    const state = ctx.getState();
    const confidence = state.confidence;
    const stuckSignal =
      reflection.shouldReplan ||
      this.consecutiveToolFailures >= 2 ||
      (!toolResult.success && !!toolResult.error);

    if (confidence >= 50 || !stuckSignal) return;
    if (debateOrchestrator.getDebateCount(this.missionId) >= 5) return;

    // Build a focused debate question from the current situation.
    const lastAction = think.next_action || "(no action)";
    const failureMode = toolResult.success
      ? "succeeded but confidence remains low"
      : `failed: ${toolResult.error ?? "unknown error"}`;
    const reflectionHint = reflection.rootCause || reflection.analysis.slice(0, 120);
    const question =
      `We're stuck at iteration ${state.iteration} (confidence ${confidence}%). ` +
      `Last action "${lastAction}" ${failureMode}. ` +
      `Reflection: ${reflectionHint}. ` +
      `Should we retry, replan, escalate, or try a different approach?`;

    // Auto-select participants: Executive + topic expert + 2 generalists.
    const expert = detectTopic(question);
    const participants = ["orchestrator"];
    if (expert) participants.push(expert);
    participants.push("code-reviewer", "bug-fixer");

    const memorySummary = [
      `knownIssues: ${state.memory.knownIssues.length}`,
      `architectureNotes: ${state.memory.architectureNotes.length}`,
      `attemptedFixes: ${state.memory.attemptedFixes.length}`,
      `keyFiles: ${state.memory.keyFiles.size}`,
      state.memory.knownIssues.slice(-3).join(" | "),
    ]
      .filter((s) => s.trim().length > 0)
      .join("; ");
    const recentActions = state.toolHistory
      .slice(-5)
      .map(
        (t) =>
          `${t.tool}(${JSON.stringify(t.args).slice(0, 80)}) → ${t.success ? "OK" : "FAIL"}`,
      );

    this.emitAgentThinking(
      ctx,
      `Auto-debate triggered (confidence ${confidence}%, stuck signal: ${
        reflection.shouldReplan
          ? "shouldReplan"
          : `${this.consecutiveToolFailures} tool failures`
      }). Question: "${question.slice(0, 100)}"`,
      confidence,
    );

    try {
      const result = await debateOrchestrator.debate(
        this.missionId,
        question,
        participants,
        {
          goal: state.goal || ctx.goal || "(unknown goal)",
          memory: memorySummary,
          recentActions,
        },
        this.provider,
        ctx.signal,
      );
      if (result && result.winner) {
        // Feed the debate winner back into the next Think phase so the
        // Executive Agent reasons about it explicitly. We also nudge
        // confidence upward to reflect that the team reached consensus.
        this.lastProposedAction =
          `Per debate (consensus ${result.consensusLevel}%): ${result.winner.proposal} — ${result.executiveDecision}`;
        confidenceTracker.adjustFor(
          this.missionId,
          Math.max(5, Math.round(result.consensusLevel / 10)),
          `Debate reached ${result.consensusLevel}% consensus — boosting confidence.`,
        );
        // Persist a memory note about the debate outcome.
        const notes = [...state.memory.architectureNotes];
        notes.push(
          `[debate] Q: ${question.slice(0, 80)} → A: ${result.winner.proposal.slice(0, 120)} (${result.consensusLevel}% consensus)`,
        );
        ctx.updateMemory({ architectureNotes: notes.slice(-25) });
      } else if (result) {
        // Debate ran but produced no winner — note it.
        this.lastProposedAction = null;
      }
      // If result is null, the debate was skipped (cap or no provider) —
      // do nothing and let the loop continue normally.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitError(ctx, `Auto-debate failed (continuing): ${msg}`, true);
    }
  }

  // ── Phase E: Destructive-action detection ────────────────────────────────
  /**
   * Heuristic: does this tool mutate the filesystem (and therefore warrant
   * a rollback snapshot)?
   *   - `edit_file` is always destructive.
   *   - `run_command` is destructive when the command contains write-like
   *     operations (rm, mv, cp, redirection, npm install, git push, etc.).
   */
  private isDestructive(tool: string, args: Record<string, unknown>): boolean {
    if (tool === "edit_file") return true;
    if (tool === "run_command") {
      const cmd =
        typeof args.command === "string" ? args.command.toLowerCase() : "";
      if (!cmd) return false;
      // Regex catalog of write-like shell operations. Erring on the side of
      // "destructive" is safe — an unnecessary snapshot is cheap, but a
      // missed destructive action means we can't roll back.
      const writePatterns: RegExp[] = [
        /\brm\b/,
        /\bmv\b/,
        /\bcp\b/,
        /\bmkdir\b/,
        /\bchmod\b/,
        /\bchown\b/,
        /\bsed\s+-i\b/,
        /\btee\b/,
        /\bdd\s+of=/,
        />>?/, // > or >> (shell redirection)
        /\bnpm\s+(install|i)\b/,
        /\bbun\s+add\b/,
        /\byarn\s+add\b/,
        /\bgit\s+(push|commit|reset|checkout|clean|rebase)\b/,
        /\bcurl\s+-o\b/,
        /\bwget\s+(?:-o|--output-document)/,
        /\brsync\b/,
        /\bunlink\b/,
        /\btruncate\b/,
        /\bpatch\s+-p\d+\b/,
      ];
      return writePatterns.some((re) => re.test(cmd));
    }
    return false;
  }

  /**
   * Compute the list of file paths that may be affected by the upcoming tool
   * call. Used to decide which files to snapshot before a destructive action.
   *   - `edit_file` → the file in `args.path` (resolved to absolute).
   *   - `run_command` → we can't reliably parse arbitrary shell commands, so
   *     we snapshot all previously-modified files as a safety net.
   */
  private filesPotentiallyAffected(
    tool: string,
    args: Record<string, unknown>,
    state: MissionState,
  ): string[] {
    const cwd = state.cwd;
    const files = new Set<string>();

    const resolve = (p: string): string =>
      path.isAbsolute(p) ? p : path.resolve(cwd, p);

    if (tool === "edit_file" && typeof args.path === "string" && args.path) {
      files.add(resolve(args.path));
    }

    if (tool === "run_command") {
      // Snapshot all previously-modified files since the command may touch
      // any of them. Also try to extract any path-like arguments from the
      // command string as a best-effort guess.
      for (const f of state.filesModified) {
        if (f) files.add(resolve(f));
      }
      const cmd = typeof args.command === "string" ? args.command : "";
      // Match relative/absolute paths in the command (very rough heuristic).
      const pathMatch = /(?:^|\s)(\.?\/?(?:[A-Za-z0-9_.\-/]+\/[A-Za-z0-9_.\-/]+))/g;
      let m: RegExpExecArray | null;
      while ((m = pathMatch.exec(cmd)) !== null) {
        const candidate = m[1];
        // Only snapshot files with code-like extensions to avoid noise.
        if (/\.(ts|tsx|js|jsx|json|md|py|go|rs|java|c|cpp|h|hpp|sh|yml|yaml|toml)$/.test(candidate)) {
          files.add(resolve(candidate));
        }
      }
    }

    return Array.from(files);
  }

  // ── Phase D: cached-result type guard ──────────────────────────────────────
  /**
   * Narrow an unknown cached value to a `ToolCallResult`. The cache only ever
   * stores `ToolCallResult` objects (set exclusively by this loop), but we
   * still type-guard at retrieval time to be safe against future producers.
   */
  private isCachedResult(value: unknown): value is ToolCallResult {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.success === "boolean" &&
      typeof v.durationMs === "number" &&
      "output" in v
    );
  }
}
