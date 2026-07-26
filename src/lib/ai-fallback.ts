// CodeInsight AI — Model Fallback (P3.2)
//
// Wrapper around callAI() that iterates a configurable fallback chain.
// When the primary provider returns a RETRYABLE error (402 credits exhausted,
// 429 rate limit, 5xx server error, network/timeout), the wrapper automatically
// tries the next provider in the chain until one succeeds OR a non-retryable
// error is hit (400 bad request, 401 unauthorized, TokenBudgetExceeded).
//
// NON-RETRYABLE errors propagate immediately — they won't be fixed by retrying
// on a different provider (same prompt → same 400; same key type → same 401;
// user's budget issue → not a provider problem).
//
// AUDIT LOGGING: each callAI() attempt writes its own AICallLog row (success
// or error) via the existing telemetry in ai-client.ts. This wrapper does NOT
// double-log; the SUCCESSFUL call's row already records which provider/model
// actually handled the request. Callers can read `providerUsed` /
// `attemptedProviders` from the returned FallbackResult for higher-level
// audit (e.g. logging to AICallLog with passType="[fallback]").
//
// BYOK users do NOT use this fallback chain — they're using their own API key
// and the admin's chain (with admin's keys) wouldn't apply. Callers must check
// `aiMode === "platform"` before loading the chain.
//
// LATENCY: bounded by `maxAttempts` (default: primary + 2 fallbacks = 3).
// Vercel 60s Hobby limit: 3 attempts × ~18s each ≈ 54s. Each attempt's
// `timeout` (default 60s) is reduced to 20s for fallback providers to leave
// room for multiple attempts within the request budget.

import {
  callAI,
  type AIProviderConfig,
  type AICallOptions,
  type AIMessage,
  type AICallResult,
  type AICallAuditContext,
} from "./ai-client";
import { TokenBudgetExceededError } from "./billing/token-budget";

export interface FallbackProvider {
  providerId: string;
  model: string;
  /** Optional explicit key (BYOK fallback). If omitted, the wrapper resolves
   *  the admin's stored key for this providerId via getFallbackChain(). */
  apiKey?: string;
  baseUrl?: string;
}

export interface FallbackAttempt {
  providerId: string;
  model: string;
  error?: string;
  success: boolean;
}

export interface FallbackResult extends AICallResult {
  /** Provider ID that ultimately handled the call (primary or one of the fallbacks). */
  providerUsed: string;
  /** Model that ultimately handled the call. */
  modelUsed: string;
  /** Ordered log of every attempt — primary first, then fallbacks in chain order. */
  attemptedProviders: FallbackAttempt[];
}

/** Default per-attempt timeout (seconds) for fallback providers — keeps the
 *  total request under the Vercel 60s limit even with 3 attempts. */
const FALLBACK_TIMEOUT_SEC = 20;

/**
 * Call AI with a fallback chain. Tries each provider in order until one
 * succeeds. Errors that trigger fallback: 402, 429, 5xx, timeout, network.
 * Errors that DON'T trigger fallback: 400 (bad request — won't help with
 * different provider), 401 (API key issue — same key won't fix), and
 * TokenBudgetExceededError (user's budget, not provider).
 *
 * Each failed attempt is logged via callAI()'s existing audit logging — no
 * duplicate logging here. The returned FallbackResult.providerUsed /
 * attemptedProviders can be used by callers for higher-level audit context.
 */
export async function callAIWithFallback(
  primary: AIProviderConfig,
  fallbacks: FallbackProvider[],
  messages: AIMessage[],
  options: AICallOptions,
): Promise<FallbackResult> {
  const attempted: FallbackAttempt[] = [];

  // ── Attempt 1: primary provider ──
  try {
    const result = await callAI(primary, messages, options);
    attempted.push({
      providerId: primary.providerId,
      model: primary.model,
      success: true,
    });
    return {
      ...result,
      providerUsed: primary.providerId,
      modelUsed: primary.model,
      attemptedProviders: attempted,
    };
  } catch (e: any) {
    // TokenBudgetExceededError is a user-side issue — never retry, never fallback.
    if (e instanceof TokenBudgetExceededError) throw e;

    const errMsg = e?.message || String(e);
    attempted.push({
      providerId: primary.providerId,
      model: primary.model,
      error: errMsg,
      success: false,
    });

    // Non-retryable error — re-throw immediately. No point trying other providers.
    if (!shouldFallback(errMsg)) {
      throw e;
    }

    // ── Attempts 2..N: fallback providers ──
    for (const fb of fallbacks) {
      try {
        const fbConfig: AIProviderConfig = {
          providerId: fb.providerId,
          apiKey: fb.apiKey || primary.apiKey, // fall back to primary key if not specified
          baseUrl: fb.baseUrl || "",
          model: fb.model,
          temperature: primary.temperature,
          maxTokens: primary.maxTokens,
          // Tighter timeout for fallbacks so 3 attempts fit in 60s budget.
          timeout: FALLBACK_TIMEOUT_SEC,
        };
        // Override per-call options for the fallback attempt: use the
        // FALLBACK_TIMEOUT_SEC unless the caller explicitly set a smaller one.
        const fbOptions: AICallOptions = {
          ...options,
          timeout: Math.min(options.timeout ?? FALLBACK_TIMEOUT_SEC, FALLBACK_TIMEOUT_SEC),
        };
        const result = await callAI(fbConfig, messages, fbOptions);
        attempted.push({
          providerId: fb.providerId,
          model: fb.model,
          success: true,
        });
        console.log(
          `[ai-fallback] Primary ${primary.providerId}/${primary.model} failed (${errMsg.slice(0, 80)}); ` +
          `fallback ${fb.providerId}/${fb.model} succeeded.`,
        );
        return {
          ...result,
          providerUsed: fb.providerId,
          modelUsed: fb.model,
          attemptedProviders: attempted,
        };
      } catch (e2: any) {
        if (e2 instanceof TokenBudgetExceededError) throw e2;

        const err2Msg = e2?.message || String(e2);
        attempted.push({
          providerId: fb.providerId,
          model: fb.model,
          error: err2Msg,
          success: false,
        });

        // Non-retryable error on this fallback — re-throw immediately.
        // (e.g. 400 from openai means the prompt is malformed; another provider
        // will likely also reject it. Better to surface the real cause.)
        if (!shouldFallback(err2Msg)) {
          throw e2;
        }
        // Continue to next fallback.
      }
    }

    // All providers exhausted — re-throw the primary's error (the first
    // failure is most actionable for the user).
    throw e;
  }
}

/**
 * Determine if an error should trigger fallback to another provider.
 *
 * RETRYABLE (returns true):
 *   - 402 Payment Required (credits exhausted)
 *   - 429 Too Many Requests (rate limit)
 *   - 500, 502, 503, 504 (server errors)
 *   - timeout / timed out / AbortError
 *   - ECONNRESET / fetch failed / network
 *   - "insufficient_quota" / "quota exceeded"
 *
 * NON-RETRYABLE (returns false):
 *   - 400 Bad Request (prompt issue — same prompt → same 400 on another provider)
 *   - 401 Unauthorized (API key issue — same key type won't fix)
 *   - 403 Forbidden
 *   - TokenBudgetExceeded (user's budget — handled separately, never reaches here)
 */
export function shouldFallback(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();

  // 402 — credits exhausted (e.g. OpenRouter balance depleted)
  if (msg.includes("402") || msg.includes("payment required") || msg.includes("credits")) return true;
  // 429 — rate limited
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) return true;
  // 5xx — server-side failures
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  if (msg.includes("server error") || msg.includes("internal error") || msg.includes("bad gateway")) return true;
  if (msg.includes("service unavailable") || msg.includes("gateway timeout")) return true;
  // Network / timeout
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborterror")) return true;
  if (msg.includes("econnreset") || msg.includes("fetch failed") || msg.includes("network")) return true;
  if (msg.includes("socket hang up") || msg.includes("epipe") || msg.includes("econnrefused")) return true;
  // Quota / billing — OpenAI / Anthropic specific messages
  if (msg.includes("insufficient_quota") || msg.includes("quota exceeded") || msg.includes("billing")) return true;

  // Don't fallback on:
  //   400 / "bad request" / "invalid" — prompt issue, different provider won't help
  //   401 / "unauthorized" / "invalid api key" — key issue, different provider won't fix
  //   403 / "forbidden"
  return false;
}

/**
 * Load the fallback chain from the admin's PlatformAIConfig.
 *
 * Reads the JSON `fallbackChain` column from the first enabled PlatformAIConfig
 * row, then resolves each `{ providerId, model }` entry to a full
 * FallbackProvider by looking up the admin's stored (encrypted) API key +
 * baseUrl for that providerId. Entries whose providerId is not configured (or
 * is disabled) are silently skipped.
 *
 * Returns an empty array if:
 *   - No PlatformAIConfig row exists
 *   - No fallbackChain JSON is set
 *   - The JSON is malformed
 *   - The DB / decryption layer throws (best-effort, never throws)
 */
export async function getFallbackChain(): Promise<FallbackProvider[]> {
  try {
    const { db } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/crypto");

    const config = await db.platformAIConfig.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    });
    if (!config?.fallbackChain) return [];

    let parsed: Array<{ providerId: string; model: string; apiKey?: string; baseUrl?: string }>;
    try {
      parsed = JSON.parse(config.fallbackChain);
    } catch {
      console.warn("[ai-fallback] fallbackChain JSON is malformed — ignoring");
      return [];
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const resolved: FallbackProvider[] = [];
    for (const item of parsed) {
      if (!item?.providerId || !item?.model) continue;

      // If the entry has an explicit apiKey (BYOK-style), use it as-is.
      if (item.apiKey) {
        resolved.push({
          providerId: item.providerId,
          model: item.model,
          apiKey: item.apiKey,
          baseUrl: item.baseUrl,
        });
        continue;
      }

      // Otherwise, look up the admin's stored (encrypted) key for this
      // providerId. Skip if not configured or disabled.
      try {
        const fbConfig = await db.platformAIConfig.findUnique({
          where: { providerId: item.providerId },
        });
        if (!fbConfig?.enabled || !fbConfig.encryptedApiKey) continue;
        const apiKey = decrypt(fbConfig.encryptedApiKey);
        if (!apiKey) continue;
        resolved.push({
          providerId: fbConfig.providerId,
          model: item.model,
          apiKey,
          baseUrl: fbConfig.baseUrl,
        });
      } catch {
        // decryption or DB error for this entry — skip and try the next
      }
    }
    return resolved;
  } catch (e) {
    console.warn("[ai-fallback] Failed to load fallback chain:", e);
    return [];
  }
}

/**
 * Helper: enrich an AICallAuditContext with fallback metadata.
 *
 * Callers that want to surface "this call was served by a fallback" in their
 * AICallLog row can use this to set the `passType` field to include the
 * fallback marker. This is OPTIONAL — callAI() already logs the actual
 * provider that handled the call, so the AICallLog row will have the correct
 * `provider` column regardless.
 *
 * @example
 *   const result = await callAIWithFallback(primary, fallbacks, msgs, {
 *     ...opts,
 *     audit: markFallbackAudit(opts.audit, result),
 *   });
 */
export function markFallbackAudit(
  base: AICallAuditContext | undefined,
  result: FallbackResult,
): AICallAuditContext {
  const attempts = result.attemptedProviders.filter((a) => !a.success).length;
  if (attempts === 0) return base ?? {};
  const fallbackTag = `[fb:${result.providerUsed}]`;
  return {
    userId: base?.userId ?? null,
    analysisId: base?.analysisId ?? null,
    agent: base?.agent ?? null,
    passType: base?.passType ? `${base.passType}${fallbackTag}` : fallbackTag,
  };
}
