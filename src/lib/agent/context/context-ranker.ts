// CodeInsight AI — Context Ranker (Layer 5)
// Ranks context needs by priority for token budget allocation.

import type { ContextNeed, TokenAllocation } from "../contracts";

const PRIORITY_WEIGHT = {
  "critical": 3,
  "important": 2,
  "nice-to-have": 1,
} as const;

export class ContextRanker {
  /**
   * Rank context needs by priority (critical first, then important, then nice-to-have).
   * Within same priority, longer content ranks higher (more important info).
   */
  rank(needs: ContextNeed[]): ContextNeed[] {
    return [...needs].sort((a, b) => {
      // First: by priority (critical > important > nice-to-have)
      const pa = PRIORITY_WEIGHT[a.priority];
      const pb = PRIORITY_WEIGHT[b.priority];
      if (pa !== pb) return pb - pa;

      // Second: by type (file > symbol > graph > issues > architecture > insight)
      const typeOrder = ["file", "symbol", "graph", "issues", "architecture", "insight", "diff"];
      const ta = typeOrder.indexOf(a.type);
      const tb = typeOrder.indexOf(b.type);
      if (ta !== tb) return ta - tb;

      // Third: alphabetical (stable sort)
      return a.ref.localeCompare(b.ref);
    });
  }

  /** Assign priority to a context need based on its type and role */
  static inferPriority(type: ContextNeed["type"]): ContextNeed["priority"] {
    switch (type) {
      case "file":
      case "issues":
        return "critical";
      case "symbol":
      case "graph":
        return "important";
      case "architecture":
      case "insight":
      case "diff":
      default:
        return "nice-to-have";
    }
  }
}
