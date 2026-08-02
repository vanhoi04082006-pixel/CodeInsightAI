// CodeInsight AI — Planner (Layer 6)
// LLM generates ExecutionPlan (DAG + Policy) from user query.
// Uses callAI to generate structured JSON plan, validates it, retries on failure.

import type {
  Planner as IPlanner,
  ExecutionPlan,
  ExecutionGraph,
  ExecutionPolicy,
  AgentContext,
  Result,
  AgentError,
  Capability,
  PlanNode,
} from "../contracts";
import { ExecutionGraphBuilder, createNode } from "./execution-graph";
import { defaultPolicy } from "./execution-policy";
import { PlanValidator } from "./plan-validator";

export class PlannerImpl implements IPlanner {
  private readonly validator = new PlanValidator();
  private readonly validCapabilities: Capability[];

  constructor(validCapabilities: Capability[]) {
    this.validCapabilities = validCapabilities;
  }

  /**
   * Generate an ExecutionPlan from a user query.
   * 1. Build LLM prompt with available capabilities + project context
   * 2. Call AI to generate JSON plan
   * 3. Parse + validate the plan
   * 4. Retry on invalid (max 2 retries)
   */
  async plan(query: string, context: AgentContext): Promise<Result<ExecutionPlan>> {
    const maxRetries = 2;
    let lastError: AgentError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1. Build prompt
        const prompt = this.buildPrompt(query, context, attempt, lastError);

        // 2. Call AI
        const { callAI } = await import("@/lib/ai-client");
        const result = await callAI(
          {
            providerId: "shopaikey",
            apiKey: "",
            baseUrl: "",
            model: "gpt-4.1-mini",
            temperature: 0.3,
            maxTokens: 4000,
            timeout: 30,
          },
          [
            { role: "system", content: this.systemPrompt() },
            { role: "user", content: prompt },
          ],
          { maxTokens: 4000, temperature: 0.3, timeout: 30 },
        );

        // 3. Parse JSON (result is AICallResult, use .content)
        const parsed = this.parsePlan(result.content);
        if (!parsed.ok) {
          lastError = parsed.error;
          continue;
        }

        // 4. Validate
        const validation = this.validator.validate(parsed.value, this.validCapabilities);
        if (!validation.ok) {
          lastError = validation.error;
          continue;
        }

        // Success
        return ok(parsed.value);
      } catch (e) {
        lastError = {
          code: "PLAN_GENERATION_FAILED",
          message: `Plan generation attempt ${attempt + 1} failed: ${e instanceof Error ? e.message : String(e)}`,
          recoverable: attempt < maxRetries,
        };
      }
    }

    // All retries exhausted — return fallback plan
    return ok(this.fallbackPlan(query));
  }

  /** Build the system prompt for the LLM */
  private systemPrompt(): string {
    return `You are a Senior Staff Engineer planning code analysis tasks.
Generate an Execution Plan as JSON with this exact structure:

{
  "nodes": [
    {
      "id": "step-1",
      "step": "Find symbols related to login",
      "capability": "find-symbol",
      "params": { "name": "login" },
      "dependsOn": [],
      "parallelGroup": "discover"
    }
  ],
  "policy": {
    "maxParallel": 3,
    "defaultTimeout": 30000,
    "defaultRetries": 2,
    "continueOnFailure": true,
    "rollbackOnFailure": true
  }
}

Rules:
- Each node must have a unique "id"
- "dependsOn" must reference existing node IDs
- No circular dependencies
- "parallelGroup" groups nodes that can run in parallel
- Available capabilities: ${this.validCapabilities.join(", ")}
- Respond with ONLY the JSON, no markdown fences, no explanation`;
  }

  /** Build the user prompt with project context */
  private buildPrompt(
    query: string,
    context: AgentContext,
    attempt: number,
    lastError: AgentError | null,
  ): string {
    const parts: string[] = [];

    parts.push(`Project: ${context.spm.repoOwner}/${context.spm.repoName}`);
    parts.push(`Files: ${context.spm.metrics.totalFiles}, Lines: ${context.spm.metrics.totalLines}`);
    parts.push(`Architecture: ${context.spm.architecture.pattern}`);
    parts.push(`Issues: ${context.spm.issues.length} total`);
    parts.push(``);
    parts.push(`User request: ${query}`);

    if (attempt > 0 && lastError) {
      parts.push(``);
      parts.push(`Previous attempt failed with error:`);
      parts.push(lastError.message);
      parts.push(`Please fix the issue and generate a valid plan.`);
    }

    return parts.join("\n");
  }

  /** Parse AI response into ExecutionPlan */
  private parsePlan(response: string): Result<ExecutionPlan> {
    try {
      // Strip markdown fences if present
      let json = response.trim();
      if (json.startsWith("```")) {
        json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(json);

      // Build ExecutionGraph from parsed nodes
      const builder = new ExecutionGraphBuilder();
      for (const node of parsed.nodes || []) {
        builder.addNode({
          id: node.id,
          step: node.step || node.id,
          capability: node.capability,
          toolName: node.toolName,
          params: node.params || {},
          dependsOn: node.dependsOn || [],
          parallelGroup: node.parallelGroup,
          status: "pending",
        });
      }

      const graph = builder.build();

      // Build policy (merge with defaults)
      const policy: ExecutionPolicy = {
        ...defaultPolicy(),
        ...parsed.policy,
        tokenBudget: defaultPolicy().tokenBudget, // always use default token budget
      };

      // Estimate
      const estimatedTokens = 1000 + graph.nodes.length * 500;
      const estimatedTimeMs = graph.nodes.length * 5000;

      return ok({ graph, policy, estimatedTokens, estimatedTimeMs });
    } catch (e) {
      return err(
        "PLAN_GENERATION_FAILED",
        `Failed to parse AI response as JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Fallback plan when AI fails — simple sequential search */
  private fallbackPlan(query: string): ExecutionPlan {
    const builder = new ExecutionGraphBuilder();

    builder.addNode(createNode("fallback-1", `Search code for: ${query}`, "search-code", { query }));
    builder.addNode(
      createNode("fallback-2", "Find issues", "find-issues", {}, { dependsOn: ["fallback-1"] }),
    );

    const graph = builder.build();
    const policy = defaultPolicy();
    policy.maxParallel = 1; // sequential fallback

    return {
      graph,
      policy,
      estimatedTokens: 2000,
      estimatedTimeMs: 10000,
    };
  }
}

// ─── Factory ───

export function createPlanner(validCapabilities: Capability[]): PlannerImpl {
  return new PlannerImpl(validCapabilities);
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, details, recoverable: false } };
}
