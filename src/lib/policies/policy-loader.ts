// CodeInsight AI — P3.5 Policy Engine: DB-backed policy loader with TTL cache.
//
// `loadPolicies()` returns the list of ENABLED policies, parsed into the
// runtime `Policy` shape (with `config` as a parsed object, not a JSON
// string). Cached in-memory for 60 seconds — policies don't change often
// and we don't want to hit the DB on every AI call. `clearPolicyCache()`
// is called by the admin POST endpoint after a policy update so the new
// config takes effect immediately (no 60s wait).
//
// On DB error: returns an empty list (fail-OPEN — a broken policy table
// shouldn't take down the whole app). The worklog plan calls this out
// explicitly for V1; a "fail-closed" flag for critical policies is V2.

import { db } from "@/lib/db";
import type { Policy, PolicyType } from "./types";
import { isPolicyType } from "./types";

/**
 * Cached policy list. `null` = no cache (force next call to hit the DB).
 * The cache stores only ENABLED policies — disabled ones are filtered in
 * the query so the cache is small (typically <10 rows for 8 catalog types).
 */
interface PolicyCache {
  policies: Policy[];
  expiresAt: number;
}

let cache: PolicyCache | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds — accept up to 60s staleness.

/**
 * Load all enabled policies from DB (cached for 60s).
 * Returns an empty array on DB error (fail-open).
 */
export async function loadPolicies(): Promise<Policy[]> {
  // Cache hit — return immediately (no DB round-trip in the hot path).
  if (cache && cache.expiresAt > Date.now()) {
    return cache.policies;
  }

  try {
    const rows = await db.policy.findMany({ where: { enabled: true } });
    const policies: Policy[] = [];
    for (const r of rows) {
      // Skip rows with an unknown type — forward-compat: a future policy
      // type added to the DB but not yet in POLICY_CATALOG is silently
      // ignored rather than crashing every AI call.
      if (!isPolicyType(r.type)) continue;
      let config: Record<string, any> = {};
      try {
        config = r.config ? JSON.parse(r.config) : {};
      } catch {
        // Malformed JSON in the config column — skip this policy.
        // (The admin UI validates on save, so this should never happen
        // in practice, but we fail-safe rather than crash.)
        continue;
      }
      policies.push({
        id: r.id,
        type: r.type as PolicyType,
        enabled: r.enabled,
        config,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      });
    }
    cache = { policies, expiresAt: Date.now() + CACHE_TTL_MS };
    return policies;
  } catch (e) {
    // DB error — fail-open (return empty list, don't crash the request).
    // Log to stderr so the operator sees it; the cache stays null so the
    // next call retries immediately (no 60s lockout on a transient error).
    console.error("[policies] loadPolicies failed — failing open:", e);
    return [];
  }
}

/**
 * Invalidate the in-memory cache. Called by the admin POST endpoint after
 * a policy is created/updated/deleted so the new config takes effect on
 * the next request (no 60s wait).
 */
export function clearPolicyCache(): void {
  cache = null;
}
