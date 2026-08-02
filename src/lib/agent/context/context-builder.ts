// CodeInsight AI — Context Builder (Layer 5)
// Assembles LLM context from tool results within token budget.
// Combines TokenBudgetManager + ContextRanker + ContextCompressor.

import type {
  AgentContext,
  AgentContextPayload,
  ContextBuilder as IContextBuilder,
  ContextNeed,
  TokenBudget,
  TokenAllocation,
  Result,
  AgentError,
} from "../contracts";
import { TokenBudgetManager } from "./token-budget";
import { ContextRanker } from "./context-ranker";
import { ContextCompressor } from "./context-compressor";

export class ContextBuilderImpl implements IContextBuilder {
  private readonly budgetManager = new TokenBudgetManager();
  private readonly ranker = new ContextRanker();
  private readonly compressor = new ContextCompressor();

  /**
   * Build context from needs within token budget.
   * Steps:
   * 1. Rank needs by priority
   * 2. Fetch content for each need (via Query Service)
   * 3. Estimate tokens
   * 4. Allocate budget (drop/trim low-priority)
   * 5. Compress if needed
   * 6. Deduplicate
   * 7. Assemble final context string
   */
  build(
    needs: ContextNeed[],
    budget: TokenBudget,
    context: AgentContext,
  ): Result<AgentContextPayload> {
    try {
      // Phase 1: Rank needs
      const rankedNeeds = this.ranker.rank(needs);

      // Phase 2: Fetch content for each need
      const contentMap = new Map<string, string>();
      for (const need of rankedNeeds) {
        const content = this.fetchContent(need, context);
        if (content) {
          contentMap.set(need.ref, content);
        }
      }

      // Phase 3: Estimate tokens
      const allocations: TokenAllocation[] = rankedNeeds.map((need) => {
        const content = contentMap.get(need.ref) || "";
        const estimatedTokens = this.budgetManager.estimate(content);
        return {
          need,
          estimatedTokens,
          actualTokens: estimatedTokens,
          included: true,
        };
      });

      // Phase 4: Check budget
      const totalEstimated = allocations.reduce((sum, a) => sum + a.estimatedTokens, 0);
      let truncated = false;

      if (totalEstimated > budget.available) {
        // Trim: drop nice-to-have first, then compress important
        const priorityOrder = { "nice-to-have": 0, important: 1, critical: 2 };

        // Sort by priority (lowest first = drop first)
        const sorted = [...allocations].sort(
          (a, b) => priorityOrder[a.need.priority] - priorityOrder[b.need.priority],
        );

        let remaining = budget.available;

        // Process from highest priority to lowest
        for (let i = sorted.length - 1; i >= 0; i--) {
          const alloc = sorted[i];

          if (alloc.need.priority === "critical") {
            // Always include critical — compress if needed
            if (alloc.estimatedTokens > remaining) {
              const content = contentMap.get(alloc.need.ref) || "";
              const compressed = this.compressor.compress(content, remaining);
              contentMap.set(alloc.need.ref, compressed);
              alloc.actualTokens = this.budgetManager.estimate(compressed);
              remaining = 0;
              truncated = true;
            } else {
              remaining -= alloc.estimatedTokens;
            }
          } else if (remaining >= alloc.estimatedTokens) {
            // Fits — include as-is
            remaining -= alloc.estimatedTokens;
          } else if (remaining > 100 && alloc.need.priority === "important") {
            // Partial — compress to fit
            const content = contentMap.get(alloc.need.ref) || "";
            const compressed = this.compressor.compress(content, remaining);
            contentMap.set(alloc.need.ref, compressed);
            alloc.actualTokens = this.budgetManager.estimate(compressed);
            remaining = 0;
            truncated = true;
          } else {
            // Drop
            alloc.included = false;
            alloc.actualTokens = 0;
            truncated = true;
          }
        }
      }

      // Phase 5: Assemble final context string
      const parts: string[] = [];
      let totalTokens = 0;

      for (const alloc of allocations) {
        if (!alloc.included) continue;
        const content = contentMap.get(alloc.need.ref) || "";
        if (!content) continue;

        // Add section header
        const header = this.formatHeader(alloc.need);
        parts.push(`${header}\n${content}`);
        totalTokens += alloc.actualTokens;
      }

      // Deduplicate parts
      const deduplicated = this.compressor.deduplicate(parts);
      const finalContent = deduplicated.join("\n\n---\n\n");

      // Final token count
      const finalTokens = this.budgetManager.estimate(finalContent);

      return ok({
        content: finalContent,
        tokens: finalTokens,
        allocations,
        truncated,
      });
    } catch (e) {
      return err(
        "TOOL_EXECUTION_FAILED",
        `Context build failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Fetch content for a context need via Query Service */
  private fetchContent(need: ContextNeed, context: AgentContext): string {
    try {
      switch (need.type) {
        case "file": {
          const result = context.query.findFile(need.ref);
          if (result.ok && result.value) {
            return `File: ${need.ref}\n${result.value.content || "(empty file)"}`;
          }
          return "";
        }
        case "symbol": {
          const result = context.query.findSymbol(need.ref);
          if (result.ok && result.value.length > 0) {
            const symbols = result.value
              .map((s) => `- ${s.name} (${s.kind}) at ${s.file}:${s.line}`)
              .join("\n");
            return `Symbols matching "${need.ref}":\n${symbols}`;
          }
          return "";
        }
        case "issues": {
          const result = context.query.findIssuesByFile(need.ref);
          if (result.ok && result.value.length > 0) {
            const issues = result.value
              .map((i) => `- [${i.severity}] ${i.title} (${i.file}:${i.line})\n  ${i.recommendation}`)
              .join("\n");
            return `Issues in ${need.ref}:\n${issues}`;
          }
          return "";
        }
        case "architecture": {
          const result = context.query.getArchitecture();
          if (result.ok) {
            const arch = result.value;
            return `Architecture: ${arch.pattern}\nStrengths: ${arch.strengths.join(", ")}\nWeaknesses: ${arch.weaknesses.join(", ")}`;
          }
          return "";
        }
        case "graph": {
          const result = context.query.findCircularDependencies();
          if (result.ok && result.value.length > 0) {
            return `Circular dependencies:\n${result.value.map((c) => c.join(" → ")).join("\n")}`;
          }
          return "No circular dependencies found.";
        }
        case "insight": {
          // Get AI insight from SPM
          const insight = context.spm.insights.find((i) => i.type === need.ref);
          if (insight) {
            return `AI Insight (${need.ref}):\n${JSON.stringify(insight.data, null, 2)}`;
          }
          return "";
        }
        case "diff": {
          // Diff content is passed directly via ref
          return need.ref;
        }
        default:
          return "";
      }
    } catch {
      return "";
    }
  }

  /** Format a section header for a context need */
  private formatHeader(need: ContextNeed): string {
    const emoji = {
      file: "📄",
      symbol: "🔍",
      issues: "⚠️",
      architecture: "🏗️",
      graph: "🔗",
      insight: "✨",
      diff: "📝",
    }[need.type] || "📋";

    return `${emoji} ${need.type.toUpperCase()}: ${need.ref}`;
  }
}

// ─── Factory ───

export function createContextBuilder(): ContextBuilderImpl {
  return new ContextBuilderImpl();
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
