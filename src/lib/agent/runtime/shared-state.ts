// CodeInsight AI — Runtime Shared State (Layer 7)
// Per-analysis registry that allows stateless tools (apply-patch, rollback-changes)
// to access the runtime's RollbackManager without changing the AgentContext contract.
//
// The ExecutionEngine registers its RollbackManager (wired with real file ops)
// keyed by analysisId. Tools look it up by ctx.analysisId.

import type { RollbackManager } from "./rollback-manager";

const registry = new Map<string, RollbackManager>();

/** Register a RollbackManager for an analysis (called by ExecutionEngine at start). */
export function registerRollbackManager(analysisId: string | null, manager: RollbackManager): void {
  if (!analysisId) return;
  registry.set(analysisId, manager);
}

/** Unregister (called by ExecutionEngine at end). */
export function unregisterRollbackManager(analysisId: string | null): void {
  if (!analysisId) return;
  registry.delete(analysisId);
}

/** Get the RollbackManager for an analysis (called by tools). */
export function getSharedRollbackManager(analysisId: string | null): RollbackManager | null {
  if (!analysisId) return null;
  return registry.get(analysisId) ?? null;
}
