// CodeInsight AI — Token Budget Enforcement (P3.1)
//
// Real monthly token budget enforcement backed by the `TokenUsageRecord` table.
// Each AI call (chat, analysis pass, agent task, streaming) increments a per-
// (user, month) counter atomically via Prisma's `increment` operator — no
// SUM query on AICallLog in the hot path, so the check stays under ~10ms.
//
// Enforcement is best-effort:
//   - Pre-flight check reads the cached `totalTokens` BEFORE the network call.
//   - Post-call accounting increments the cache AFTER the response.
//   - If two parallel calls from the same user both pass the pre-flight check,
//     they will both run and both record usage — the budget is eventually-
//     consistent, not strict. This is acceptable for a token budget (slight
//     over-spend at the boundary is fine).
//   - If `userId` or `plan` is missing (background system call), the budget
//     check is SKIPPED entirely — never blocks system-critical AI calls.
//
// Admin / enterprise bypass: plan === "enterprise" → unlimited (allowed=true).
// (auth.ts auto-upgrades admin users to plan="enterprise" in the DB.)
//
// Month rollover: the `month` string ("2026-07") naturally rolls over on the
// 1st of each month — the first AI call creates a fresh row with totalTokens=0.
// No background cron is needed.

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/billing/usage";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface TokenBudgetStatus {
  /** Tokens consumed this month (from cache, real counts where available). */
  used: number;
  /** Monthly limit. -1 means unlimited (enterprise / admin). */
  limit: number;
  /** Remaining tokens. -1 means unlimited. */
  remaining: number;
  /** True when `used >= limit` (and limit is not -1). */
  exceeded: boolean;
  /** True for unlimited plans (enterprise / admin). */
  unlimited: boolean;
  /** Plan name (free | pro | team | enterprise). */
  plan: string;
  /** When the budget resets (start of next month, UTC). */
  resetsAt: Date;
}

// ───────────────────────────────────────────────────────────────────────────
// Error — thrown by callAI() when the pre-flight check fails.
// API routes catch this and translate it to a 429 response.
// ───────────────────────────────────────────────────────────────────────────

export class TokenBudgetExceededError extends Error {
  status: TokenBudgetStatus;
  /** Milliseconds until the budget resets (always >= 0). */
  retryAfterMs: number;

  constructor(status: TokenBudgetStatus) {
    const limitStr = status.limit === -1 ? "∞" : status.limit.toLocaleString();
    super(
      `Token budget exceeded. Used ${status.used.toLocaleString()}/${limitStr} tokens this month. ` +
      `Resets at ${status.resetsAt.toISOString()}.`
    );
    this.name = "TokenBudgetExceededError";
    this.status = status;
    this.retryAfterMs = Math.max(0, status.resetsAt.getTime() - Date.now());
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Returns the month key for the given date (or now) as "YYYY-MM".
 * Same format as `UsageRecord.month` — kept in sync.
 */
export function getMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns the start of the next month (UTC) for the given date's month.
 * Used as the `resetsAt` timestamp.
 */
export function getMonthResetDate(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/**
 * Rough token estimate from text length (4 chars ≈ 1 token).
 * Used to account for streaming calls where the provider doesn't return
 * `usage.totalTokens` (most SSE streams don't).
 *
 * Same heuristic as the existing `/api/chat` debug code (line ~110).
 */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Look up the user's plan + role from the DB. Single indexed `findUnique`.
 * Falls back to `{ plan: "free", role: "user" }` if the user isn't found.
 */
export async function getUserPlanInfo(userId: string): Promise<{ plan: string; role: string }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });
    return { plan: user?.plan ?? "free", role: user?.role ?? "user" };
  } catch {
    // DB error — default to free so we still enforce (fail-closed for safety).
    return { plan: "free", role: "user" };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Read: getTokenUsage — single findUnique on (userId, month) index.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the user's current monthly token usage from the cache (NOT a SUM query).
 *
 * @param userId  The Prisma User.id (cuid).
 * @param plan    The user's plan ("free" | "pro" | "team" | "enterprise").
 *                Used to look up `PLAN_LIMITS[plan].tokensPerMonth`. If the
 *                plan is unknown, falls back to free (1M tokens).
 */
export async function getTokenUsage(userId: string, plan: string): Promise<TokenBudgetStatus> {
  const month = getMonthKey();
  const resetsAt = getMonthResetDate();
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const limit = limits.tokensPerMonth; // -1 = unlimited

  // Unlimited plans (enterprise / admin auto-upgraded): no DB read needed.
  if (limit === -1) {
    return {
      used: 0,
      limit: -1,
      remaining: -1,
      exceeded: false,
      unlimited: true,
      plan,
      resetsAt,
    };
  }

  // Single indexed lookup — O(1).
  let record = await db.tokenUsageRecord.findUnique({
    where: { userId_month: { userId, month } },
  });

  // First call of the month: lazily create the row so subsequent reads can
  // use `update` (atomic increment) instead of `upsert`.
  if (!record) {
    try {
      record = await db.tokenUsageRecord.create({
        data: { userId, month, totalTokens: 0 },
      });
    } catch {
      // Race condition: another concurrent call created the row first.
      // Re-read — the other call's increment will land shortly.
      record = await db.tokenUsageRecord.findUnique({
        where: { userId_month: { userId, month } },
      });
    }
  }

  const used = record?.totalTokens ?? 0;
  const remaining = Math.max(0, limit - used);
  const exceeded = used >= limit;

  return {
    used,
    limit,
    remaining,
    exceeded,
    unlimited: false,
    plan,
    resetsAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pre-flight check: should this AI call be allowed?
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pre-flight check: can this user make an AI call right now?
 *
 * Returns `{ allowed: true, status }` if the user is under budget (or on an
 * unlimited plan). Returns `{ allowed: false, status }` if the budget is
 * exceeded — the caller should throw `TokenBudgetExceededError` (or the
 * ai-client's `callAI()` will do that for them).
 *
 * If `userId` or `plan` is missing/empty, returns `{ allowed: true, status: null }`
 * (skip the check — never block system / background calls).
 */
export async function checkTokenBudget(
  userId?: string | null,
  plan?: string | null
): Promise<{ allowed: boolean; status: TokenBudgetStatus | null }> {
  if (!userId || !plan) {
    // Skip enforcement for system / background calls.
    return { allowed: true, status: null };
  }
  const status = await getTokenUsage(userId, plan);
  return { allowed: !status.exceeded, status };
}

// ───────────────────────────────────────────────────────────────────────────
// Write: recordTokenUsage — atomic upsert with `increment`.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Increment the user's monthly token usage counter atomically.
 *
 * Uses Prisma's `upsert` with `increment` — survives concurrent calls (the
 * DB applies the increment serially; no read-then-write race). Best-effort:
 * never throws (mirrors `logAICall`'s contract — accounting failure must not
 * break the AI call).
 *
 * @param userId        The Prisma User.id.
 * @param inputTokens   Prompt tokens (from `result.usage.promptTokens`).
 * @param outputTokens  Completion tokens (from `result.usage.completionTokens`).
 * @param totalTokens   Total tokens (from `result.usage.totalTokens`). If 0 or
 *                      missing, the function falls back to `input + output`.
 */
export async function recordTokenUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number
): Promise<void> {
  // Fall back to sum if total isn't reported.
  const total = totalTokens > 0 ? totalTokens : (inputTokens + outputTokens);
  if (total <= 0) return;

  const month = getMonthKey();

  try {
    await db.tokenUsageRecord.upsert({
      where: { userId_month: { userId, month } },
      create: {
        userId,
        month,
        totalTokens: total,
        inputTokens,
        outputTokens,
        callCount: 1,
      },
      update: {
        totalTokens: { increment: total },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        callCount: { increment: 1 },
      },
    });
  } catch (e) {
    // Best-effort: never break the AI call over an accounting failure.
    console.error("[token-budget] recordTokenUsage failed (non-fatal):", e);
  }
}
