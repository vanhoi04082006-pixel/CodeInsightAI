// CodeInsight AI — DB-backed Rate Limiting (P3.3)
//
// Per-user, per-endpoint HOURLY rate limiting for the 5 expensive endpoints:
//   - /api/analyze           → "analysis"
//   - /api/analyze/ai-pass   → "analysis" (shares the analysis bucket — same
//                               user action; a single repo analysis runs 9 AI
//                               passes, so we don't want to double-count)
//   - /api/chat              → "chat"
//   - /api/chat/stream       → "chat" (shares the chat bucket)
//   - /api/agents/execute    → "agent"
//
// Backed by the `RateLimitBucket` Prisma model (one row per (userId, endpoint,
// hour)). Atomic `upsert + increment` survives concurrent requests — no
// read-then-write race (the DB applies the increment serially). This is the
// ONLY rate-limit mechanism that works on Vercel serverless — the previous
// in-memory `src/lib/production/rate-limiter.ts` resets on every cold-start
// and was never wired to any route (dead code).
//
// Plan limits are defined in `PLAN_LIMITS` (`src/lib/billing/usage.ts`):
//   - free:        10 analysis / 20 chat / 5 agent  per hour
//   - pro:        100 analysis / 200 chat / 50 agent per hour
//   - team:       500 analysis / 1000 chat / 200 agent per hour
//   - enterprise: unlimited (-1 — admin users are auto-upgraded to enterprise
//                 in auth.ts JWT callback, so they bypass here too)
//
// Enforcement is best-effort / fail-open:
//   - Pre-flight check reads the cached `count` BEFORE the expensive work.
//   - If `!allowed`, the caller returns HTTP 429 with `Retry-After` + JSON body.
//   - Post-call accounting increments the cache AFTER the response is decided.
//   - If the DB fails on read OR write, the request is ALLOWED through — never
//     block a legitimate user because of a DB hiccup. The failure is logged.
//   - Enterprise / unlimited plans skip both the read and the write (no row
//     is ever created for them — saves DB writes).
//
// Bucket rollover: the `hour` string ("2024-01-15-14") naturally rolls over
// at the top of each hour. First request of the new hour creates a fresh row
// with count=1. No background cron is needed. Old rows accumulate; a
// `cleanupOldBuckets()` helper purges rows older than 24h opportunistically
// (callers should invoke it with ~1% probability per request — see
// `maybeCleanupOldBuckets()`).

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/billing/usage";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** Endpoint identifier — the three logical rate-limit buckets. */
export type RateLimitEndpoint = "analysis" | "chat" | "agent";

/** Snapshot of the user's current rate-limit status for one endpoint. */
export interface RateLimitStatus {
  /** Requests already consumed this hour (from cache, O(1) lookup). */
  count: number;
  /** Hourly limit. -1 means unlimited (enterprise / admin). */
  limit: number;
  /** Remaining requests. -1 means unlimited; 0 means exhausted. */
  remaining: number;
  /** True when `count >= limit` (and limit is not -1). */
  exceeded: boolean;
  /** When the bucket resets (start of next hour). */
  resetsAt: Date;
  /** True for unlimited plans (enterprise / admin). No DB row exists. */
  unlimited: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers — bucket key + reset time
// ───────────────────────────────────────────────────────────────────────────

/**
 * Returns the hour-bucket key for the given date (or now) as
 * "YYYY-MM-DD-HH" — e.g. "2024-01-15-14" for 2pm on Jan 15, 2024.
 *
 * Uses LOCAL time (server timezone). On Vercel, serverless functions run in
 * UTC by default, so this is effectively UTC. The bucket boundary is hour-
 * aligned regardless of timezone — only the human-readable label differs.
 */
export function getHourBucket(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}-` +
    `${String(date.getHours()).padStart(2, "0")}`
  );
}

/**
 * Returns the start of the next hour (the moment the current bucket resets).
 * Used as `resetsAt` in the rate-limit status + `Retry-After` calculation.
 */
export function getNextHourReset(date: Date = new Date()): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours() + 1,
    0,
    0,
    0,
  );
}

/**
 * Seconds until the current bucket resets (always >= 0).
 * Used to populate the `Retry-After` HTTP header on 429 responses.
 */
export function getSecondsUntilReset(date: Date = new Date()): number {
  const resetsAt = getNextHourReset(date);
  return Math.max(0, Math.ceil((resetsAt.getTime() - date.getTime()) / 1000));
}

/**
 * Look up the per-endpoint hourly limit for the given plan.
 * Returns -1 for unlimited plans (enterprise / unknown treated as free).
 */
function getLimitForEndpoint(plan: string, endpoint: RateLimitEndpoint): number {
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const limitMap: Record<RateLimitEndpoint, number> = {
    analysis: limits.analysesPerHour,
    chat: limits.chatPerHour,
    agent: limits.agentPerHour,
  };
  return limitMap[endpoint];
}

// ───────────────────────────────────────────────────────────────────────────
// Read: getRateLimitUsage — single findUnique on (userId, endpoint, hour).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the user's current hourly rate-limit usage for the given endpoint.
 *
 * Single indexed `findUnique` on `(userId, endpoint, hour)` — O(1). Falls
 * back to count=0 if no row exists yet (first request of the hour).
 *
 * Fail-open: if the DB read throws, returns `unlimited: true` so the request
 * is allowed through (rate limiting must never block legitimate users over
 * a transient DB issue — log and move on).
 *
 * @param userId   Prisma User.id (cuid).
 * @param plan     User's plan name ("free" | "pro" | "team" | "enterprise").
 *                 Unknown / missing → falls back to "free" (lowest limits).
 * @param endpoint One of "analysis" | "chat" | "agent".
 */
export async function getRateLimitUsage(
  userId: string,
  plan: string,
  endpoint: RateLimitEndpoint,
): Promise<RateLimitStatus> {
  const limit = getLimitForEndpoint(plan, endpoint);
  const resetsAt = getNextHourReset();

  // Unlimited plan (enterprise / admin auto-upgraded): no DB read needed.
  if (limit === -1) {
    return {
      count: 0,
      limit: -1,
      remaining: -1,
      exceeded: false,
      resetsAt,
      unlimited: true,
    };
  }

  const hour = getHourBucket();
  let count = 0;

  try {
    const record = await db.rateLimitBucket.findUnique({
      where: {
        userId_endpoint_hour: { userId, endpoint, hour },
      },
      select: { count: true },
    });
    count = record?.count ?? 0;
  } catch (e) {
    // Fail-open: log + treat as unlimited so the request can proceed.
    console.error("[rate-limiter] getRateLimitUsage DB read failed (fail-open):", e);
    return {
      count: 0,
      limit,
      remaining: limit,
      exceeded: false,
      resetsAt,
      unlimited: false,
    };
  }

  const remaining = Math.max(0, limit - count);
  const exceeded = count >= limit;

  return { count, limit, remaining, exceeded, resetsAt, unlimited: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Pre-flight check: should this request be allowed?
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pre-flight check: can this user make this request right now?
 *
 * Returns `{ allowed: true, status }` if the user is under their hourly
 * limit (or on an unlimited plan). Returns `{ allowed: false, status }` if
 * the limit is exceeded — the caller should return HTTP 429 with
 * `Retry-After` + the structured `status` payload.
 *
 * If `userId` or `plan` is missing/empty, returns `{ allowed: true, status: null }`
 * (skip the check — never block system / background calls).
 */
export async function checkRateLimit(
  userId: string | null | undefined,
  plan: string | null | undefined,
  endpoint: RateLimitEndpoint,
): Promise<{ allowed: boolean; status: RateLimitStatus | null }> {
  if (!userId || !plan) {
    // Skip enforcement for system / background calls (no authenticated user).
    return { allowed: true, status: null };
  }
  const status = await getRateLimitUsage(userId, plan, endpoint);
  return { allowed: status.unlimited || !status.exceeded, status };
}

// ───────────────────────────────────────────────────────────────────────────
// Write: incrementRateLimit — atomic upsert with `increment`.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Atomically increment the user's hourly request counter for an endpoint.
 *
 * Uses Prisma's `upsert` with `count: { increment: 1 }` — survives
 * concurrent requests (the DB applies the increment serially; no read-then-
 * write race). Best-effort: never throws (accounting failure must not break
 * the request — mirrors `logAICall` + `recordTokenUsage` contract).
 *
 * Note: callers should ONLY call this for ALLOWED requests, AFTER the
 * response has been computed. Do NOT increment on 429 (the user is already
 * blocked — don't pile on).
 */
export async function incrementRateLimit(
  userId: string,
  endpoint: RateLimitEndpoint,
): Promise<void> {
  const hour = getHourBucket();
  try {
    await db.rateLimitBucket.upsert({
      where: { userId_endpoint_hour: { userId, endpoint, hour } },
      create: { userId, endpoint, hour, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (e) {
    // Best-effort: never break the request over an accounting failure.
    console.error("[rate-limiter] incrementRateLimit failed (non-fatal):", e);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Convenience: enforceRateLimit — check + increment in one call.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Express-like middleware helper: pre-flight check + post-allowed increment.
 *
 * Returns `{ blocked: false, status }` if the request is allowed (and the
 * counter has been incremented). Returns `{ blocked: true, status }` if the
 * rate limit is exceeded (the counter is NOT incremented in this case).
 *
 * The caller is responsible for translating `blocked: true` into an HTTP 429
 * response with `Retry-After` + the `status` payload. See `rateLimit429Response()`
 * below for a ready-to-use NextResponse builder.
 *
 * Fail-open: if any DB error occurs, returns `{ blocked: false, status: null }`
 * (the request is allowed through). The error is logged inside
 * `getRateLimitUsage` / `incrementRateLimit`.
 *
 * For unlimited plans (limit === -1): no DB read OR write happens — returns
 * immediately with `blocked: false`. This is the enterprise / admin bypass.
 */
export async function enforceRateLimit(
  userId: string | null | undefined,
  plan: string | null | undefined,
  endpoint: RateLimitEndpoint,
): Promise<{ blocked: boolean; status: RateLimitStatus | null }> {
  const { allowed, status } = await checkRateLimit(userId, plan, endpoint);

  // Unlimited plan: skip the increment entirely (saves a DB write).
  if (status?.unlimited) {
    return { blocked: false, status };
  }

  if (!allowed) {
    return { blocked: true, status };
  }

  // Allowed → increment the counter. If userId is missing (background call),
  // skip the increment (checkRateLimit returned allowed:true + status:null).
  if (userId) {
    await incrementRateLimit(userId, endpoint);
  }

  return { blocked: false, status };
}

// ───────────────────────────────────────────────────────────────────────────
// Response helpers — build the standard 429 body + headers.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the JSON body for an HTTP 429 rate-limit-exceeded response.
 * Returned object is suitable for `NextResponse.json(body, { status: 429 })`.
 */
export function rateLimit429Body(status: RateLimitStatus, endpoint: RateLimitEndpoint) {
  const minutesUntilReset = Math.ceil(
    (status.resetsAt.getTime() - Date.now()) / 60_000,
  );
  return {
    error: "Rate limit exceeded",
    message:
      `You've made ${status.count} ${endpoint} requests this hour ` +
      `(limit: ${status.limit}). Try again in ${Math.max(1, minutesUntilReset)} minute(s) ` +
      `or upgrade your plan for a higher limit.`,
    rateLimit: {
      endpoint,
      count: status.count,
      limit: status.limit,
      remaining: status.remaining,
      resetsAt: status.resetsAt.toISOString(),
      unlimited: status.unlimited,
    },
    upgradeUrl: "/?view=settings",
  };
}

/**
 * Build the standard rate-limit HTTP headers (`X-RateLimit-*`).
 * Apply these to BOTH 200 and 429 responses so clients can display remaining
 * quota proactively. For unlimited plans, the values are strings of -1 / "unlimited".
 */
export function rateLimitHeaders(status: RateLimitStatus | null): Record<string, string> {
  if (!status) return {};
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(status.limit),
    "X-RateLimit-Remaining": String(status.remaining),
    "X-RateLimit-Reset": String(Math.floor(status.resetsAt.getTime() / 1000)),
  };
  return headers;
}

/**
 * Seconds until the bucket resets — for the `Retry-After` header on 429s.
 * Returns 0 (no retry needed) for unlimited plans; otherwise the seconds
 * remaining in the current hour.
 */
export function retryAfterSeconds(status: RateLimitStatus | null): number {
  if (!status || status.unlimited) return 0;
  return Math.max(1, getSecondsUntilReset());
}

// ───────────────────────────────────────────────────────────────────────────
// Maintenance — opportunistic cleanup of stale buckets.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Delete `RateLimitBucket` rows older than `maxAgeHours` (default 24h).
 *
 * Returns the number of rows deleted. Best-effort: never throws.
 *
 * On Vercel there are no background workers / cron, so this is invoked
 * opportunistically by `maybeCleanupOldBuckets()` (~1% chance per protected
 * request). Keeps the table from growing unbounded — at 1000 req/hour × 24h,
 * the table would otherwise accumulate ~24k rows/day per active user.
 */
export async function cleanupOldBuckets(maxAgeHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  try {
    const result = await db.rateLimitBucket.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  } catch (e) {
    console.error("[rate-limiter] cleanupOldBuckets failed (non-fatal):", e);
    return 0;
  }
}

/**
 * Opportunistic cleanup — invoke with ~1% probability per protected request.
 * Non-blocking: spawns the cleanup as a background promise (caller does NOT
 * await it). The `probability` parameter makes this easy to test.
 */
export function maybeCleanupOldBuckets(
  probability: number = 0.01,
  maxAgeHours: number = 24,
): void {
  if (Math.random() >= probability) return;
  // Fire-and-forget — never block the response on cleanup.
  cleanupOldBuckets(maxAgeHours).catch(() => {
    /* already logged inside cleanupOldBuckets */
  });
}
