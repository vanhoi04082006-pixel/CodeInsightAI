// CodeInsight AI — Token Budget Manager (Layer 5)
// Estimates token counts, allocates budget across context components,
// and trims low-priority content to fit within model limits.

import type { TokenBudget, TokenAllocation, ContextNeed, Result, AgentError } from "../contracts";

// Conservative ratio: ~4 characters per token (safe for mixed code/text)
const CHARS_PER_TOKEN = 4;

export class TokenBudgetManager {
  /** Estimate token count for a string (conservative: 4 chars/token) */
  estimate(content: string): number {
    if (!content) return 0;
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }

  /**
   * Allocate token budget across context needs.
   * Priority order: critical > important > nice-to-have.
   * Low-priority items are trimmed/dropped first on overflow.
   */
  allocate(needs: ContextNeed[], budget: TokenBudget): TokenAllocation[] {
    // Phase 1: Estimate tokens for each need
    const allocations: TokenAllocation[] = needs.map((need) => {
      const content = this.getContentForNeed(need);
      const estimatedTokens = this.estimate(content);
      return {
        need,
        estimatedTokens,
        actualTokens: estimatedTokens,
        included: true,
      };
    });

    // Phase 2: Check if total fits within budget
    const totalEstimated = allocations.reduce((sum, a) => sum + a.estimatedTokens, 0);

    if (totalEstimated <= budget.available) {
      return allocations; // Everything fits
    }

    // Phase 3: Trim — drop nice-to-have first, then important (never critical)
    const priorityOrder = { "nice-to-have": 0, important: 1, critical: 2 };

    // Sort by priority (lowest priority first = nice-to-have first to drop)
    const sorted = [...allocations].sort(
      (a, b) => priorityOrder[a.need.priority] - priorityOrder[b.need.priority],
    );

    let remaining = budget.available;
    const result: TokenAllocation[] = [];

    // Process from highest priority to lowest
    for (let i = sorted.length - 1; i >= 0; i--) {
      const alloc = sorted[i];

      if (alloc.need.priority === "critical") {
        // Always include critical
        result.push({ ...alloc, included: true, actualTokens: alloc.estimatedTokens });
        remaining -= alloc.estimatedTokens;
      } else if (remaining >= alloc.estimatedTokens) {
        // Fits — include
        result.push({ ...alloc, included: true, actualTokens: alloc.estimatedTokens });
        remaining -= alloc.estimatedTokens;
      } else if (remaining > 100 && alloc.need.priority === "important") {
        // Partial — truncate to fit remaining
        const truncatedTokens = remaining;
        result.push({
          ...alloc,
          included: true,
          actualTokens: truncatedTokens,
          estimatedTokens: alloc.estimatedTokens,
        });
        remaining = 0;
      } else {
        // Drop
        result.push({ ...alloc, included: false, actualTokens: 0 });
      }
    }

    return result;
  }

  /** Check if adding an allocation would exceed remaining budget */
  canFit(allocation: TokenAllocation, remaining: number): boolean {
    return remaining >= allocation.estimatedTokens;
  }

  /** Create a default token budget for common models */
  static forModel(model: string): TokenBudget {
    const modelLimits: Record<string, { total: number; reserved: number }> = {
      "gpt-5-nano": { total: 128000, reserved: 2000 },
      "gpt-4.1-nano": { total: 128000, reserved: 3000 },
      "gpt-4o-mini": { total: 128000, reserved: 4000 },
      "gpt-5-mini": { total: 128000, reserved: 6000 },
      "gpt-4.1-mini": { total: 128000, reserved: 8000 },
      "claude-sonnet-4-5": { total: 200000, reserved: 8000 },
      "deepseek-chat": { total: 64000, reserved: 6000 },
      "grok-4-fast-reasoning": { total: 131072, reserved: 4000 },
      "qwen3-coder-flash": { total: 131072, reserved: 6000 },
    };

    const config = modelLimits[model] ?? { total: 128000, reserved: 8000 };
    return {
      total: config.total,
      reserved: config.reserved,
      available: config.total - config.reserved,
    };
  }

  /** Get content string for a context need (placeholder — actual content provided by ContextBuilder) */
  private getContentForNeed(need: ContextNeed): string {
    // This is a placeholder — the ContextBuilder passes actual content
    // For estimation purposes, we use the ref as content length proxy
    return need.ref || "";
  }

  /** Set actual content for estimation (called by ContextBuilder) */
  estimateWithContent(content: string): number {
    return this.estimate(content);
  }
}
