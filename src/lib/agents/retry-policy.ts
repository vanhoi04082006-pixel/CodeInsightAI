// CodeInsight AI — Retry Policy utilities
import type { RetryPolicy } from "./types";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [],
};

export const AGGRESSIVE_RETRY: RetryPolicy = {
  maxAttempts: 5,
  backoffMs: 500,
  backoffMultiplier: 1.5,
  maxBackoffMs: 10000,
  retryableErrors: [],
};

export const NO_RETRY: RetryPolicy = {
  maxAttempts: 1,
  backoffMs: 0,
  backoffMultiplier: 1,
  maxBackoffMs: 0,
  retryableErrors: [],
};

export const GIT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 2000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: ["network", "timeout", "lock", "EAGAIN"],
};

/** Wait with exponential backoff. */
export function backoff(attempt: number, policy: RetryPolicy): Promise<void> {
  if (attempt <= 0) return Promise.resolve();
  const ms = Math.min(
    policy.backoffMs * Math.pow(policy.backoffMultiplier, attempt - 1),
    policy.maxBackoffMs
  );
  return new Promise(r => setTimeout(r, ms));
}

/** Check if an error is retryable per the policy. */
export function isRetryable(err: any, policy: RetryPolicy): boolean {
  if (!err) return false;
  const msg = (err?.message ?? String(err)).toLowerCase();
  if (policy.retryableErrors.length === 0) return true;  // empty = retry all
  return policy.retryableErrors.some(p => msg.includes(p.toLowerCase()));
}
