// CodeInsight AI — AI Insight Service (Layer 3)
// Wraps the existing AI Client (src/lib/ai-client.ts) behind the Service interface.
// Provides AI-generated insights on SPM data (overview, security review, etc.).

import type {
  SemanticProjectModel,
  SemanticInsight,
  AIInsightService as IAIInsightService,
  Result,
  AgentError,
} from "../contracts";

// AgentContext type is needed for generateInsight but we avoid importing
// from Layer 5 (Context Builder). We define a minimal type here.
interface MinimalAgentContext {
  spm: SemanticProjectModel;
}

export class AIInsightServiceImpl implements IAIInsightService {
  /**
   * Get a cached AI insight from SPM.insights (if AI deep analysis already ran).
   * Returns null if the insight type is not available.
   */
  getInsight(
    type: string,
    spm: SemanticProjectModel,
  ): Result<SemanticInsight | null> {
    try {
      const insight = spm.insights.find((i) => i.type === type);
      return ok(insight || null);
    } catch (e) {
      return err(
        "TOOL_EXECUTION_FAILED",
        `Failed to get insight: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Generate a new AI insight by calling the AI.
   * This is an async operation — the Tool layer (Phase 5) will call generateInsightAsync.
   *
   * Note: The contract defines this as sync, but AI calls are inherently async.
   * We return an error for the sync version and provide an async variant.
   */
  generateInsight(type: string, context: any): Result<SemanticInsight> {
    return err(
      "TOOL_EXECUTION_FAILED",
      "AI insight generation requires async — use generateInsightAsync()",
    );
  }

  /**
   * Generate a new AI insight asynchronously.
   * Calls the existing callAI() with a prompt built from SPM data.
   */
  async generateInsightAsync(
    type: string,
    context: MinimalAgentContext,
  ): Promise<Result<SemanticInsight>> {
    try {
      const { callAI } = await import("@/lib/ai-client");
      const { getPlatformAIConfig } = await import("@/lib/platform-ai");
      const { spm } = context;

      const provider = await getPlatformAIConfig();
      if (!provider) {
        return err("TOOL_EXECUTION_FAILED", "No AI provider configured. Set PLATFORM_AI_API_KEY env var or configure a platform AI provider.");
      }

      // Build prompt based on insight type
      const prompt = this.buildPrompt(type, spm);
      const systemPrompt = "You are a Senior Staff Engineer. Respond in valid JSON only.";

      const result = await callAI(
        {
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: provider.model,
          temperature: 0.7,
          maxTokens: 4000,
          timeout: 45,
        },
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        { maxTokens: 4000, temperature: 0.7, timeout: 45 },
      );

      return ok({
        type: type as SemanticInsight["type"],
        data: result,
        confidence: 0.8,
      });
    } catch (e) {
      return err(
        "TOOL_EXECUTION_FAILED",
        `AI insight generation failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Build an AI prompt for the given insight type + SPM data. */
  private buildPrompt(type: string, spm: SemanticProjectModel): string {
    const repoInfo = `Repository: ${spm.repoOwner}/${spm.repoName}
Files: ${spm.metrics.totalFiles}, Lines: ${spm.metrics.totalLines}
Architecture: ${spm.architecture.pattern}
Scores: Overall ${spm.metrics.maintainabilityIndex}/100, Coupling ${spm.metrics.couplingScore}, Cohesion ${spm.metrics.cohesionScore}`;

    const topIssues = spm.issues
      .slice(0, 10)
      .map((i) => `- [${i.severity}] ${i.title} (${i.file}:${i.line})`)
      .join("\n");

    switch (type) {
      case "overview":
        return `${repoInfo}\n\nIssues:\n${topIssues}\n\nProvide executive overview as JSON: {healthAssessment: string, topRisks: [{title, severity}], quickWins: [{title, effort}]}`;
      case "security":
        return `${repoInfo}\n\nSecurity issues:\n${spm.issues.filter(i => i.category === "security").map(i => `- [${i.severity}] ${i.title} (${i.file})`).join("\n")}\n\nProvide security review as JSON array: [{severity, title, file, recommendation, fixPlan: []}]`;
      case "performance":
        return `${repoInfo}\n\nPerformance issues:\n${spm.issues.filter(i => i.category === "performance").map(i => `- [${i.severity}] ${i.title} (${i.file})`).join("\n")}\n\nProvide performance review as JSON array: [{severity, title, file, recommendation}]`;
      case "architecture":
        return `${repoInfo}\n\nArchitecture: ${spm.architecture.pattern}\nStrengths: ${spm.architecture.strengths.join(", ")}\nWeaknesses: ${spm.architecture.weaknesses.join(", ")}\n\nProvide architecture review as JSON: {summary, strengths: [], weaknesses: [], suggestions: []}`;
      default:
        return `${repoInfo}\n\nAnalyze this repository and provide insights for: ${type}`;
    }
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
