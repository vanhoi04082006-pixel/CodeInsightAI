// CodeInsight AI — P3.5 Policy Engine: pure evaluation function.
//
// `evaluatePolicies()` is a PURE FUNCTION — no side effects, no DB calls,
// no logging, no throws. Given a list of policies + a context snapshot,
// returns the list of violations. Callers decide what to do with them
// (return 403, cap a parameter, log a warning, etc.).
//
// Each policy type has its own `case` branch in `evaluatePolicy()`. Adding
// a new policy type requires (a) extending PolicyType in types.ts, (b)
// adding a case here, (c) adding a catalog entry. This is deliberate —
// no arbitrary eval, no admin-supplied code, no regex injection surface.
//
// Severity rules:
// - "block" → caller MUST refuse the request (HTTP 403 + violation details)
// - "warn"  → caller logs + continues, possibly modifying a parameter
//             (currently only `max-tokens-per-call` uses warn → cap maxTokens)

import type {
  Policy,
  PolicyEvaluationContext,
  PolicyViolation,
} from "./types";

/**
 * Evaluate all enabled policies against a context.
 * Returns array of violations (empty = all policies passed).
 * Pure function — no side effects, no DB calls, no throws.
 *
 * Disabled policies are skipped. Policies whose relevant context field is
 * missing are also skipped (e.g. `max-files` is skipped if `ctx.fileCount`
 * is undefined) — this lets a single `evaluatePolicies()` call cover both
 * pre-analyze (file count known) and pre-ai-call (provider/model known)
 * checkpoints without false-positives.
 */
export function evaluatePolicies(
  policies: Policy[],
  ctx: PolicyEvaluationContext,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const policy of policies) {
    if (!policy.enabled) continue;

    const violation = evaluatePolicy(policy, ctx);
    if (violation) violations.push(violation);
  }

  return violations;
}

/**
 * Evaluate ONE policy against the context. Returns the violation if the
 * policy is triggered, or `null` if the policy passes (or is not
 * applicable to the given context — e.g. `max-files` when `fileCount` is
 * undefined).
 *
 * Switch-dispatch on `policy.type` — each case is a small typed check.
 * Falls through to `null` for unknown types (forward-compat: an unknown
 * type in the DB is silently ignored rather than crashing the request).
 */
function evaluatePolicy(
  policy: Policy,
  ctx: PolicyEvaluationContext,
): PolicyViolation | null {
  switch (policy.type) {
    case "max-files": {
      const max = policy.config.maxFiles ?? 1000;
      if (ctx.fileCount !== undefined && ctx.fileCount > max) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: `Repository has ${ctx.fileCount} files (max: ${max})`,
        };
      }
      return null;
    }

    case "max-file-size": {
      const maxMb = policy.config.maxMb ?? 5;
      const maxBytes = maxMb * 1024 * 1024;
      if (
        ctx.fileSizeBytes !== undefined &&
        ctx.fileSizeBytes > maxBytes
      ) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: `File exceeds ${maxMb}MB limit`,
        };
      }
      return null;
    }

    case "block-provider": {
      const blocked = policy.config.providerId;
      if (blocked && ctx.providerId && ctx.providerId === blocked) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: `Provider '${blocked}' is blocked by policy`,
        };
      }
      return null;
    }

    case "block-language": {
      const blocked = String(policy.config.languages || "")
        .split(",")
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean);
      if (
        ctx.languages &&
        blocked.length > 0 &&
        ctx.languages.some((l) => blocked.includes(l.toLowerCase()))
      ) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: `Language(s) blocked by policy: ${blocked.join(", ")}`,
        };
      }
      return null;
    }

    case "block-private-repos": {
      if (ctx.isPrivateRepo) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: "Private repositories are blocked by policy",
        };
      }
      return null;
    }

    case "max-tokens-per-call": {
      const max = policy.config.maxTokens ?? 4000;
      if (ctx.maxTokens !== undefined && ctx.maxTokens > max) {
        // WARN — don't block; the caller caps maxTokens to `max`.
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "warn",
          reason: `maxTokens ${ctx.maxTokens} exceeds policy max ${max} — will be capped`,
        };
      }
      return null;
    }

    case "allowed-models-only": {
      const allowed = String(policy.config.models || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (
        ctx.model &&
        allowed.length > 0 &&
        !allowed.includes(ctx.model)
      ) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: `Model '${ctx.model}' not in allowed list`,
        };
      }
      return null;
    }

    case "require-auth": {
      if (!ctx.userId) {
        return {
          policyId: policy.id,
          policyType: policy.type,
          severity: "block",
          reason: "Authentication required",
        };
      }
      return null;
    }

    default:
      // Unknown policy type — silently ignore (forward-compat).
      return null;
  }
}

/**
 * Check if any BLOCK-severity violation exists.
 * Callers use this to decide whether to return a 403.
 */
export function hasBlockingViolation(violations: PolicyViolation[]): boolean {
  return violations.some((v) => v.severity === "block");
}

/**
 * Return only the BLOCK-severity violations (for the 403 response body).
 */
export function blockingViolations(
  violations: PolicyViolation[],
): PolicyViolation[] {
  return violations.filter((v) => v.severity === "block");
}
