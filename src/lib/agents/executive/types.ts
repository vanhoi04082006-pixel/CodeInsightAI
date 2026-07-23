// CodeInsight AI — Executive Agent + ReAct Loop Types
// Phase A: Autonomous Executive Agent that uses Observe→Think→Act→Verify→Repeat.
//
// This module defines the contracts for:
//  - MissionState           : the persistent state of an autonomous mission
//  - ReActPhase             : the six phases of the reasoning loop
//  - MissionEvent           : the SSE event union streamed to the UI in real time
//  - ToolDefinition         : schema describing a tool the executive can call
//
// All public surfaces prefer `unknown` + type guards over `any` (see ESLint rule).

import type { AIProviderConfig } from "../ai-client";

// ── ReAct phases ────────────────────────────────────────────────────────────
export type ReActPhase =
  | "observe"
  | "think"
  | "act"
  | "verify"
  | "reflect"
  | "decide";

// ── Mission lifecycle status ────────────────────────────────────────────────
export type MissionStatus =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

// ── Build / test status (set by the verify phase) ───────────────────────────
export type VerificationStatus = "pass" | "fail" | "pending";

// ── Mission state ────────────────────────────────────────────────────────────
export interface MissionState {
  missionId: string;
  goal: string;
  repositoryUrl?: string;
  cwd: string;
  status: MissionStatus;
  currentPhase: ReActPhase;
  iteration: number;
  maxIterations: number;
  /** Confidence score 0-100, updated by the AI after each iteration. */
  confidence: number;
  memory: MissionMemory;
  toolHistory: ToolCall[];
  agentHistory: AgentInvocation[];
  decisions: ExecutiveDecision[];
  errors: string[];
  filesModified: string[];
  buildStatus?: VerificationStatus;
  testStatus?: VerificationStatus;
  /** Phase E: sub-goals produced by the Replanner. Cleared on each revision. */
  subGoals?: string[];
  /** Phase E: number of times the Replanner has produced a revised plan. */
  revisionCount?: number;
  /** Phase E: snapshot id taken before the most recent destructive action. */
  lastSnapshotId?: string;
  startedAt: number;
  updatedAt: number;
}

// ── Mission memory ──────────────────────────────────────────────────────────
export interface MissionMemory {
  repositoryStructure?: string[];
  /** path → short natural-language summary */
  keyFiles: Map<string, string>;
  knownIssues: string[];
  attemptedFixes: string[];
  architectureNotes: string[];
  conventions: string[];
}

// ── Tool / agent history records ────────────────────────────────────────────
export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  timestamp: number;
  success: boolean;
  durationMs?: number;
  error?: string;
  /** Phase D: optional metadata (cache hit/miss, approval flag, etc.). */
  meta?: Record<string, unknown>;
}

export interface AgentInvocation {
  agentId: string;
  taskKind: string;
  input: Record<string, unknown>;
  result?: unknown;
  timestamp: number;
  success: boolean;
  durationMs?: number;
  error?: string;
}

export interface ExecutiveDecision {
  id: string;
  iteration: number;
  phase: ReActPhase;
  reasoning: string;
  action: string;
  confidence: number;
  timestamp: number;
}

// ── Tool catalog (schema only — implementations live in tool-registry.ts) ──
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  category: "read" | "write" | "execute" | "search" | "analyze";
}

/** Result returned by `executeTool`. */
export interface ToolCallResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

// ── Mission context passed into the ReAct loop ───────────────────────────────
export interface MissionContext {
  missionId: string;
  goal: string;
  repositoryUrl?: string;
  cwd: string;
  provider?: AIProviderConfig;
  signal: AbortSignal;
  /** Hook used by the loop to emit MissionEvents. */
  emit: (event: MissionEvent) => void;
  /** Hook used by the loop to read/modify shared mission state. */
  getState: () => MissionState;
  updateState: (updates: Partial<MissionState>) => void;
  updateMemory: (updates: Partial<MissionMemory>) => void;
  recordToolCall: (call: ToolCall) => void;
  recordAgentInvocation: (inv: AgentInvocation) => void;
  recordDecision: (decision: ExecutiveDecision) => void;
  recordFileChange: (
    path: string,
    action: "modified" | "added" | "deleted",
    additions: number,
    deletions: number
  ) => void;
  recordTerminalOutput: (stream: "stdout" | "stderr", data: string) => void;
}

// ── Structured AI response for the "think" phase ────────────────────────────
export interface ThinkResponse {
  reasoning: string;
  next_action: string;
  tool: string;
  tool_args: Record<string, unknown>;
  confidence: number;
  is_complete: boolean;
}

// ── Final stats emitted when a mission completes ────────────────────────────
export interface MissionStats {
  iterations: number;
  toolsCalled: number;
  agentsInvoked: number;
  filesModified: number;
  decisions: number;
  errors: number;
  finalConfidence: number;
  /** Phase I: overall quality score from the final quality gate (0-100). */
  qualityScore: number;
  /** Phase I: total wall-clock duration in milliseconds. */
  durationMs: number;
}

// ── SSE event union ─────────────────────────────────────────────────────────
export type MissionEvent =
  | {
      type: "mission:started";
      missionId: string;
      goal: string;
      repositoryUrl?: string;
      timestamp: number;
    }
  | {
      type: "mission:status";
      missionId: string;
      status: MissionStatus;
      timestamp: number;
    }
  | {
      type: "react:phase";
      missionId: string;
      phase: ReActPhase;
      iteration: number;
      timestamp: number;
    }
  | {
      type: "agent:thinking";
      missionId: string;
      agent: string;
      message: string;
      confidence?: number;
      timestamp: number;
    }
  | {
      type: "agent:acting";
      missionId: string;
      agent: string;
      action: string;
      detail?: string;
      timestamp: number;
    }
  | {
      type: "agent:status";
      missionId: string;
      agent: string;
      status:
        | "idle"
        | "thinking"
        | "acting"
        | "waiting"
        | "done"
        | "error";
      detail?: string;
      timestamp: number;
    }
  | {
      type: "agent:result";
      missionId: string;
      agent: string;
      success: boolean;
      summary: string;
      timestamp: number;
    }
  | {
      type: "tool:call";
      missionId: string;
      tool: string;
      args: Record<string, unknown>;
      timestamp: number;
      /** Phase D: optional metadata (cache hit/miss, approval flag, etc.). */
      meta?: Record<string, unknown>;
    }
  | {
      type: "tool:result";
      missionId: string;
      tool: string;
      success: boolean;
      result?: unknown;
      durationMs?: number;
      timestamp: number;
      /** Phase D: optional metadata (cache hit/miss, etc.). */
      meta?: Record<string, unknown>;
    }
  | {
      type: "confidence:update";
      missionId: string;
      confidence: number;
      reason: string;
      timestamp: number;
    }
  | {
      type: "decision";
      missionId: string;
      decision: ExecutiveDecision;
      timestamp: number;
    }
  | {
      type: "file:change";
      missionId: string;
      path: string;
      action: "modified" | "added" | "deleted";
      additions: number;
      deletions: number;
      timestamp: number;
    }
  | {
      type: "terminal:output";
      missionId: string;
      stream: "stdout" | "stderr";
      data: string;
      timestamp: number;
    }
  | {
      type: "memory:update";
      missionId: string;
      key: string;
      value: unknown;
      timestamp: number;
    }
  | {
      type: "mission:completed";
      missionId: string;
      success: boolean;
      summary: string;
      durationMs: number;
      stats: MissionStats;
      timestamp: number;
    }
  | {
      type: "error";
      missionId: string;
      message: string;
      recoverable: boolean;
      timestamp: number;
    };

// ── Type guards (useful when handling `unknown` payloads) ───────────────────
export function isMissionEvent(value: unknown): value is MissionEvent {
  if (typeof value !== "object" || value === null) return false;
  const evt = value as { type?: unknown };
  return typeof evt.type === "string" && evt.type.includes(":");
}

export function isThinkResponse(value: unknown): value is ThinkResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.reasoning === "string" &&
    typeof v.next_action === "string" &&
    typeof v.tool === "string" &&
    typeof v.confidence === "number" &&
    typeof v.is_complete === "boolean" &&
    (v.tool_args === undefined || typeof v.tool_args === "object")
  );
}
