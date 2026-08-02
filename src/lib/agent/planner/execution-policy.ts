// CodeInsight AI — Execution Policy (Layer 6)
// Default and override policies for plan execution.

import type { ExecutionPolicy, TokenBudget, PermissionLevel } from "../contracts";
import { TokenBudgetManager } from "../context/token-budget";

/** Default execution policy — safe, conservative */
export function defaultPolicy(model: string = "gpt-4.1-mini"): ExecutionPolicy {
  return {
    maxParallel: 3,
    defaultTimeout: 30000, // 30s per node
    defaultRetries: 2,
    tokenBudget: TokenBudgetManager.forModel(model),
    continueOnFailure: true,
    rollbackOnFailure: true,
    requireConfirmationFor: ["prompt" as PermissionLevel],
  };
}

/** Conservative policy — sequential, no parallel, longer timeouts */
export function conservativePolicy(model: string = "gpt-4.1-mini"): ExecutionPolicy {
  return {
    maxParallel: 1,
    defaultTimeout: 60000,
    defaultRetries: 3,
    tokenBudget: TokenBudgetManager.forModel(model),
    continueOnFailure: false,
    rollbackOnFailure: true,
    requireConfirmationFor: ["prompt" as PermissionLevel],
  };
}

/** Aggressive policy — high parallelism, shorter timeouts */
export function aggressivePolicy(model: string = "gpt-4.1-mini"): ExecutionPolicy {
  return {
    maxParallel: 5,
    defaultTimeout: 15000,
    defaultRetries: 1,
    tokenBudget: TokenBudgetManager.forModel(model),
    continueOnFailure: true,
    rollbackOnFailure: false,
    requireConfirmationFor: ["prompt" as PermissionLevel],
  };
}

/** Merge a node-level policy override with the global policy */
export function mergePolicy(
  global: ExecutionPolicy,
  override?: Partial<ExecutionPolicy>,
): ExecutionPolicy {
  if (!override) return global;
  return {
    maxParallel: override.maxParallel ?? global.maxParallel,
    defaultTimeout: override.defaultTimeout ?? global.defaultTimeout,
    defaultRetries: override.defaultRetries ?? global.defaultRetries,
    tokenBudget: override.tokenBudget ?? global.tokenBudget,
    continueOnFailure: override.continueOnFailure ?? global.continueOnFailure,
    rollbackOnFailure: override.rollbackOnFailure ?? global.rollbackOnFailure,
    requireConfirmationFor: override.requireConfirmationFor ?? global.requireConfirmationFor,
  };
}
