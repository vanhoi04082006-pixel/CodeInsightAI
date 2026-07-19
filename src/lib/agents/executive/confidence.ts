// CodeInsight AI — Confidence Tracker
// Phase B: Tracks the Executive Agent's confidence in the current mission
// trajectory and exposes trend / color / threshold helpers used by both the
// ReAct loop (to decide when to seek more context) and the UI (to render the
// confidence gauge).
//
// Design:
//   - Confidence is a 0-100 integer.
//   - The tracker is process-global (module singleton) but keeps per-mission
//     scores so concurrent missions don't trample each other.
//   - The spec's parameter-less API (get/set/adjust/getHistory/getTrend/
//     getColor/shouldSeekMoreContext) operates on the *active* mission,
//     selected via `setActive(missionId)`.
//   - Explicit per-mission variants (getFor/setFor/adjustFor/...) let callers
//     touch a specific mission without changing the active pointer.
//   - All mutations are clamped to [0, 100] and append to a capped history so
//     trend analysis stays cheap.

import { missionEmitter } from "./event-emitter";

export interface ConfidenceReading {
  score: number;
  reason: string;
  timestamp: number;
}

export type ConfidenceTrend = "rising" | "falling" | "stable";

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const DEFAULT_SCORE = 50;
const MAX_HISTORY = 200;
const TREND_WINDOW = 5;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SCORE;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(n)));
}

/**
 * Tracks the Executive Agent's confidence in the active mission.
 * Per-mission state is stored in private maps; the spec's parameter-less
 * methods operate on whichever mission is currently `setActive()`.
 */
export class ConfidenceTracker {
  private activeMissionId: string | null = null;
  private readonly scores = new Map<string, number>();
  private readonly histories = new Map<string, ConfidenceReading[]>();

  // ── Active mission pointer ─────────────────────────────────────────────
  /** Set the mission used by the parameter-less API. Pass null to clear. */
  setActive(missionId: string | null): void {
    this.activeMissionId = missionId;
  }

  /** Get the active mission id (or null if none set). */
  getActive(): string | null {
    return this.activeMissionId;
  }

  // ── Parameter-less (active mission) API ────────────────────────────────
  /** Current confidence score for the active mission (0-100). */
  get(): number {
    return this.getFor(this.activeMissionId ?? "");
  }

  /** Set the active mission's confidence to an absolute value (clamped 0-100). */
  set(score: number, reason: string): void {
    this.setFor(this.activeMissionId ?? "", score, reason);
  }

  /** Adjust the active mission's confidence by `delta` (clamped 0-100). */
  adjust(delta: number, reason: string): void {
    this.adjustFor(this.activeMissionId ?? "", delta, reason);
  }

  /** Full history for the active mission (oldest first). */
  getHistory(): ConfidenceReading[] {
    return this.getHistoryFor(this.activeMissionId ?? "");
  }

  /** Rising / falling / stable based on the last 5 readings. */
  getTrend(): ConfidenceTrend {
    return this.getTrendFor(this.activeMissionId ?? "");
  }

  /** CSS-style hex color: red <50, yellow 50-75, green >75. */
  getColor(): string {
    return this.getColorFor(this.activeMissionId ?? "");
  }

  /** True when confidence is below 60% — agent should gather more context. */
  shouldSeekMoreContext(): boolean {
    return this.shouldSeekMoreContextFor(this.activeMissionId ?? "");
  }

  // ── Per-mission API ────────────────────────────────────────────────────
  getFor(missionId: string): number {
    return this.scores.get(missionId) ?? DEFAULT_SCORE;
  }

  setFor(missionId: string, score: number, reason: string): void {
    if (!missionId) return;
    const clamped = clampScore(score);
    const prev = this.scores.get(missionId);
    this.scores.set(missionId, clamped);
    this.pushHistory(missionId, clamped, reason);

    // Keep MissionState.confidence in sync if the mission is known to the emitter.
    const state = missionEmitter.getState(missionId);
    if (state && state.confidence !== clamped) {
      missionEmitter.updateState(missionId, { confidence: clamped });
    }

    // Emit a confidence:update event for SSE consumers (only when changed).
    if (prev !== clamped) {
      missionEmitter.emit({
        type: "confidence:update",
        missionId,
        confidence: clamped,
        reason,
        timestamp: Date.now(),
      });
    }
  }

  adjustFor(missionId: string, delta: number, reason: string): void {
    if (!missionId) return;
    const current = this.scores.get(missionId) ?? DEFAULT_SCORE;
    this.setFor(missionId, current + delta, reason);
  }

  getHistoryFor(missionId: string): ConfidenceReading[] {
    return this.histories.get(missionId) ?? [];
  }

  getTrendFor(missionId: string): ConfidenceTrend {
    const hist = this.histories.get(missionId) ?? [];
    if (hist.length < 2) return "stable";
    const window = hist.slice(-TREND_WINDOW);
    const first = window[0].score;
    const last = window[window.length - 1].score;
    const diff = last - first;
    // Hysteresis: ignore ±2 point drift to avoid jitter on flat trajectories.
    if (diff > 2) return "rising";
    if (diff < -2) return "falling";
    return "stable";
  }

  getColorFor(missionId: string): string {
    const s = this.getFor(missionId);
    if (s < 50) return "#ef4444"; // red
    if (s < 75) return "#eab308"; // yellow
    return "#22c55e"; // green
  }

  shouldSeekMoreContextFor(missionId: string): boolean {
    return this.getFor(missionId) < 60;
  }

  // ── Maintenance ────────────────────────────────────────────────────────
  /** Drop all state for a mission (called when a mission is pruned). */
  clear(missionId: string): void {
    this.scores.delete(missionId);
    this.histories.delete(missionId);
    if (this.activeMissionId === missionId) this.activeMissionId = null;
  }

  // ── Internal ───────────────────────────────────────────────────────────
  private pushHistory(missionId: string, score: number, reason: string): void {
    const list = this.histories.get(missionId) ?? [];
    list.push({ score, reason, timestamp: Date.now() });
    if (list.length > MAX_HISTORY) list.shift();
    this.histories.set(missionId, list);
  }
}

/** Process-wide singleton. */
export const confidenceTracker = new ConfidenceTracker();
