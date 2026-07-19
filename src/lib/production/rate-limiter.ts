// CodeInsight AI — Production: Rate Limiter (Prompt 15)
// Token-bucket rate limiter with a registry of named limiters.
//
// Each `RateLimiter` has a `capacity` (max tokens held) and a `refillRate`
// (tokens per second). Tokens are replenished continuously based on elapsed
// time since the last refill.
//
// The `RateLimiterRegistry` exposes default limiters tuned for common
// CodeInsight AI subsystems: api, ai, terminal, git.

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface AcquireResult {
  allowed: boolean;
  retryAfterMs: number; // 0 if allowed
  remaining: number; // tokens remaining after this acquire
}

// ────────────────────────────────────────────────────────────────────────────
// RateLimiter — single token bucket
// ────────────────────────────────────────────────────────────────────────────

export class RateLimiter {
  private capacity: number;
  private refillRatePerSec: number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(capacity: number, refillRatePerSec: number) {
    if (capacity <= 0) throw new Error("capacity must be > 0");
    if (refillRatePerSec <= 0) throw new Error("refillRatePerSec must be > 0");
    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.tokens = capacity; // start full
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to acquire `count` tokens. Returns true if successful (and decrements
   * the bucket); false otherwise.
   */
  tryAcquire(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Current token count (after applying pending refill). */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Milliseconds until `count` tokens are available, assuming no further
   * acquisitions. Returns 0 if already available.
   */
  getTimeToRefill(count: number): number {
    this.refill();
    if (this.tokens >= count) return 0;
    const needed = count - this.tokens;
    return Math.ceil((needed / this.refillRatePerSec) * 1000);
  }

  /** Reset the bucket to full capacity (e.g. on test setup). */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  /** Get the bucket configuration. */
  getConfig(): { capacity: number; refillRatePerSec: number } {
    return { capacity: this.capacity, refillRatePerSec: this.refillRatePerSec };
  }

  /** Update the bucket configuration. Tokens are clamped to the new capacity. */
  setConfig(capacity: number, refillRatePerSec: number): void {
    if (capacity <= 0) throw new Error("capacity must be > 0");
    if (refillRatePerSec <= 0) throw new Error("refillRatePerSec must be > 0");
    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerSec;
    if (this.tokens > capacity) this.tokens = capacity;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillTime) / 1000;
    if (elapsedSec <= 0) return;
    const refilled = elapsedSec * this.refillRatePerSec;
    this.tokens = Math.min(this.capacity, this.tokens + refilled);
    this.lastRefillTime = now;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// RateLimiterRegistry — named limiters
// ────────────────────────────────────────────────────────────────────────────

export class RateLimiterRegistry {
  private limiters = new Map<string, RateLimiter>();

  /** Get an existing limiter, or create a new one with the given config. */
  getOrCreate(name: string, capacity: number, refillRatePerSec: number): RateLimiter {
    let limiter = this.limiters.get(name);
    if (!limiter) {
      limiter = new RateLimiter(capacity, refillRatePerSec);
      this.limiters.set(name, limiter);
    }
    return limiter;
  }

  /** Retrieve a previously-registered limiter, or undefined. */
  get(name: string): RateLimiter | undefined {
    return this.limiters.get(name);
  }

  /**
   * Try to acquire `count` tokens from the named limiter. Returns the result
   * with `retryAfterMs` so callers can implement backoff.
   */
  acquire(name: string, count: number = 1): AcquireResult {
    const limiter = this.limiters.get(name);
    if (!limiter) {
      // No limiter registered → allow by default (fail open).
      return { allowed: true, retryAfterMs: 0, remaining: Infinity };
    }
    const allowed = limiter.tryAcquire(count);
    return {
      allowed,
      retryAfterMs: allowed ? 0 : limiter.getTimeToRefill(count),
      remaining: limiter.getTokens(),
    };
  }

  /** Wait (asynchronously) until `count` tokens are available, then acquire. */
  async waitFor(name: string, count: number = 1, maxWaitMs: number = 30_000): Promise<boolean> {
    const limiter = this.limiters.get(name);
    if (!limiter) return true; // fail open
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (limiter.tryAcquire(count)) return true;
      const wait = limiter.getTimeToRefill(count);
      if (wait <= 0) continue;
      // Sleep at most 100ms or until next token, whichever is smaller.
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(wait, 100)));
    }
    return false;
  }

  /** Snapshot of all registered limiters (name + config + current tokens). */
  snapshot(): Array<{ name: string; capacity: number; refillRatePerSec: number; tokens: number }> {
    return Array.from(this.limiters.entries()).map(([name, lim]) => {
      const cfg = lim.getConfig();
      return { name, ...cfg, tokens: lim.getTokens() };
    });
  }

  /** Remove a named limiter. */
  remove(name: string): boolean {
    return this.limiters.delete(name);
  }

  /** Clear all limiters. */
  clear(): void {
    this.limiters.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton + defaults
// ────────────────────────────────────────────────────────────────────────────

export const rateLimiter = new RateLimiterRegistry();

/**
 * Initialize the default rate limiters. Safe to call multiple times —
 * existing limiters are not overwritten.
 *
 * Defaults (per minute):
 *   - api      : 100 req/min  (capacity 100, refill ~1.67/s)
 *   - ai       :  20 req/min  (capacity 20,  refill ~0.33/s)
 *   - terminal :  30 req/min  (capacity 30,  refill 0.5/s)
 *   - git      :  10 req/min  (capacity 10,  refill ~0.17/s)
 */
export function initDefaultLimiters(): void {
  const defaults: Array<[string, number, number]> = [
    ["api",      100, 100 / 60],
    ["ai",        20,  20 / 60],
    ["terminal",  30,  30 / 60],
    ["git",       10,  10 / 60],
  ];
  for (const [name, cap, rate] of defaults) {
    if (!rateLimiter.get(name)) {
      rateLimiter.getOrCreate(name, cap, rate);
    }
  }
}

// Initialize defaults eagerly on module load (idempotent).
initDefaultLimiters();
