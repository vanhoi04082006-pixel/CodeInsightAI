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

import { callAIForJSON } from "@/lib/agents/ai-client";
import type { AIProviderConfig, AIMessage } from "@/lib/agents/ai-client";
import { executeTool, formatToolsForAI, type ToolContext } from "./tool-registry";
import { missionEmitter } from "./event-emitter";
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

AVAILABLE TOOLS:
${formatToolsForAI()}

RECENT HISTORY (last ${recentHistory.length} actions):
${historyLines}

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
  private consecutiveErrors = 0;

  constructor(missionId: string, options: ReActLoopOptions = {}) {
    this.missionId = missionId;
    this.maxIterations = options.maxIterations ?? 25;
    this.provider = options.provider ?? DEFAULT_PROVIDER;
    this.confidenceThreshold = options.confidenceThreshold ?? 85;
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 5;
  }

  async run(goal: string, context: MissionContext): Promise<MissionState> {
    const ctx = context;
    ctx.updateState({ status: "executing", maxIterations: this.maxIterations });

    let iteration = 0;
    let lastDecision: ExecutiveDecision | null = null;

    try {
      while (iteration < this.maxIterations) {
        if (ctx.signal.aborted) {
          ctx.updateState({ status: "cancelled" });
          break;
        }

        iteration++;
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
          think = await this.think(goal, state);
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

        // ── 3. ACT ────────────────────────────────────────────────────────
        setPhase(ctx, "act");
        this.emitAgentActing(
          ctx,
          think.tool,
          `${think.next_action} — args: ${JSON.stringify(think.tool_args).slice(0, 200)}`,
        );

        const toolCtx: ToolContext = {
          missionId: this.missionId,
          cwd: ctx.getState().cwd,
          signal: ctx.signal,
          emitTerminal: (stream, data) =>
            ctx.recordTerminalOutput(stream, data),
          emitFileChange: (p, action, additions, deletions) =>
            ctx.recordFileChange(p, action, additions, deletions),
        };

        const toolStart = Date.now();
        const toolResult = await executeTool(think.tool, think.tool_args, toolCtx);
        const toolDuration = Date.now() - toolStart;

        const toolCall: ToolCall = {
          id: missionEmitter.nextId("tool"),
          tool: think.tool,
          args: think.tool_args,
          result: toolResult.output,
          timestamp: toolStart,
          success: toolResult.success,
          durationMs: toolDuration,
          error: toolResult.error,
        };

        // ── 4. VERIFY ─────────────────────────────────────────────────────
        setPhase(ctx, "verify");
        ctx.recordToolCall(toolCall);

        if (toolResult.success) {
          this.emitAgentResult(ctx, true, `${think.tool} succeeded in ${toolDuration}ms`);
          // Update memory with what we learned from this tool call.
          this.assimilateMemory(ctx, think.tool, toolResult.output);
        } else {
          this.emitAgentResult(ctx, false, `${think.tool} failed: ${toolResult.error ?? "unknown error"}`);
          ctx.getState().errors.push(`${think.tool}: ${toolResult.error ?? "failed"}`);
        }

        // ── 5. REFLECT ────────────────────────────────────────────────────
        setPhase(ctx, "reflect");
        this.emitAgentThinking(
          ctx,
          toolResult.success
            ? `Reflecting: ${think.tool} succeeded. Confidence ${think.confidence}%.`
            : `Reflecting: ${think.tool} failed. Will try a different approach next iteration.`,
          think.confidence,
        );

        // Update mission confidence from AI's reported confidence.
        ctx.updateState({ confidence: think.confidence });
        ctx.emit({
          type: "confidence:update",
          missionId: this.missionId,
          confidence: think.confidence,
          reason: think.reasoning,
          timestamp: Date.now(),
        });

        // ── 6. DECIDE (continue loop) ─────────────────────────────────────
        // Already emitted `react:phase` for decide above for the early-exit
        // case. Here we just continue to the next iteration.
      }

      // Loop ended — finalize.
      if (!ctx.signal.aborted && ctx.getState().status !== "failed") {
        ctx.updateState({ status: "completed", currentPhase: "decide" });
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
  private async think(goal: string, state: MissionState): Promise<ThinkResponse> {
    const recentHistory = state.toolHistory.slice(-5);
    const prompt = buildThinkPrompt(goal, state, recentHistory);

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
}
