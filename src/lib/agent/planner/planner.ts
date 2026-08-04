// CodeInsight AI — Planner (Layer 6)
// LLM generates ExecutionPlan (DAG + Policy) from user query.
//
// v2.0 — Production Recovery:
// - Resolves AI provider config from env/DB via getPlatformAIConfig() (NO hardcoded apiKey/baseUrl).
// - On LLM failure after retries, returns err(...) — NOT a silent ok(fallbackPlan).
// - The API route / agent layer decides what to do when planning fails.
// - Detailed error logging via console.error for observability.
// - Includes available tools + capabilities in the prompt so the LLM can pick toolName.

import type {
  Planner as IPlanner,
  ExecutionPlan,
  ExecutionPolicy,
  AgentContext,
  Result,
  AgentError,
  Capability,
} from "../contracts";
import { ExecutionGraphBuilder } from "./execution-graph";
import { defaultPolicy } from "./execution-policy";
import { PlanValidator } from "./plan-validator";
import { TokenBudgetManager } from "../context/token-budget";
import type { ContextBuilder as IContextBuilder, ContextNeed } from "../contracts";

export interface PlannerToolInfo {
  name: string;
  capabilities: Capability[];
  cost: "cheap" | "medium" | "expensive";
  permission: "allow" | "prompt" | "deny";
}

export class PlannerImpl implements IPlanner {
  private readonly validator = new PlanValidator();
  private readonly validCapabilities: Capability[];
  private readonly tools: PlannerToolInfo[];
  private readonly contextBuilder: IContextBuilder | null;
  private readonly budgetManager = new TokenBudgetManager();

  constructor(
    validCapabilities: Capability[],
    tools: PlannerToolInfo[] = [],
    contextBuilder: IContextBuilder | null = null,
  ) {
    this.validCapabilities = validCapabilities;
    this.tools = tools;
    this.contextBuilder = contextBuilder;
  }

  /**
   * Generate an ExecutionPlan from a user query.
   *
   * v2.0 flow:
   * 1. Resolve AI provider config (env → DB). If none → return err(NO_AI_PROVIDER).
   * 2. Build LLM prompt with available capabilities + tools + project context.
   * 3. Call AI (max 2 retries on transient failure / parse error / validation error).
   * 4. On success → return ok(plan).
   * 5. On failure after retries → return err(PLAN_GENERATION_FAILED) with full cause chain.
   *
   * NO silent fallback. The caller (route/runtime) decides fallback strategy.
   */
  async plan(query: string, context: AgentContext): Promise<Result<ExecutionPlan>> {
    const maxRetries = 2;
    let lastError: AgentError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1. Resolve AI provider config from env/DB
        const { getPlatformAIConfig } = await import("@/lib/platform-ai");
        const provider = await getPlatformAIConfig();
        if (!provider) {
          return err(
            "PLAN_GENERATION_FAILED",
            "No AI provider configured. Set PLATFORM_AI_API_KEY env var or configure a platform AI provider in the database.",
            { recoverable: false },
          );
        }

        // 2. Build prompt
        const prompt = this.buildPrompt(query, context, attempt, lastError);

        // 3. Call AI
        const { callAI } = await import("@/lib/ai-client");
        const result = await callAI(
          {
            providerId: provider.providerId,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            model: provider.model,
            temperature: 0.3,
            maxTokens: 4000,
            timeout: 30,
          },
          [
            { role: "system", content: this.systemPrompt() },
            { role: "user", content: prompt },
          ],
          { maxTokens: 4000, temperature: 0.3, timeout: 30, responseFormat: "json_object" },
        );

        // 4. Parse JSON
        const parsed = this.parsePlan(result.content, context);
        if (!parsed.ok) {
          lastError = parsed.error;
          console.error(`[Planner] Attempt ${attempt + 1} parse failed: ${parsed.error.message}`);
          continue;
        }

        // 5. Validate
        const validation = this.validator.validate(parsed.value, this.validCapabilities);
        if (!validation.ok) {
          lastError = validation.error;
          console.error(`[Planner] Attempt ${attempt + 1} validation failed: ${validation.error.message}`);
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
        console.error(`[Planner] Attempt ${attempt + 1} threw:`, e instanceof Error ? e.message : e);
      }
    }

    // All retries exhausted — return explicit error (NO silent fallback)
    return err(
      "PLAN_GENERATION_FAILED",
      `Plan generation failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message || "unknown"}`,
      { lastError, recoverable: false },
    );
  }

  /** Build the system prompt for the LLM */
  private systemPrompt(): string {
    const toolList = this.tools.length > 0
      ? this.tools.map(t => `  - ${t.name}: caps=[${t.capabilities.join(",")}] cost=${t.cost} perm=${t.permission}`).join("\n")
      : "(no tool inventory provided — infer toolName from capability)";

    return `You are a Senior Staff Engineer planning code analysis tasks.
Generate an Execution Plan as JSON with this exact structure:

{
  "nodes": [
    {
      "id": "step-1",
      "step": "Find symbols related to login",
      "capability": "find-symbol",
      "toolName": "find-symbol",
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
- "parallelGroup" groups nodes that can run in parallel (nodes without it run sequentially)
- "capability" must be one of: ${this.validCapabilities.join(", ")}
- "toolName" should match the tool name for the capability (see tool list below). If unsure, omit toolName and the runtime will resolve it.
- Use 2-6 nodes for most tasks. Avoid single-node plans unless the task is trivial.
- For "explain" tasks: search-code → find-architecture → find-metrics → get-diagram → ai-chat
- For "fix bug" tasks: search-code → find-issues → generate-patch → apply-patch → run-lint → run-tests
- For "refactor" tasks: find-symbol → find-references → find-impact → generate-patch → apply-patch → run-tests
- For "find issues" tasks: search-code → find-issues → find-circular-deps → ai-insight

Available tools:
${toolList}

Respond with ONLY the JSON object, no markdown fences, no explanation.`;
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
    parts.push(`Symbols: ${context.spm.metrics.totalSymbols}, Edges: ${context.spm.metrics.totalEdges}`);
    parts.push(`Architecture: ${context.spm.architecture.pattern}`);
    parts.push(`Layers: ${context.spm.architecture.layers.join(", ")}`);
    parts.push(`Issues: ${context.spm.issues.length} total`);

    // v2.0: Use ContextBuilder to dynamically assemble rich context within
    // token budget. v1 bypassed ContextBuilder entirely (dead code).
    if (this.contextBuilder) {
      const needs: ContextNeed[] = [
        { type: "architecture", ref: "", priority: "critical" },
        { type: "issues", ref: context.spm.files[0]?.path || "", priority: "important" },
        { type: "graph", ref: "", priority: "important" },
      ];
      // Add a few key files as context
      for (const f of context.spm.files.slice(0, 3)) {
        needs.push({ type: "file", ref: f.path, priority: "nice-to-have" });
      }
      const budget = TokenBudgetManager.forModel("gpt-4.1-mini");
      const ctxResult = this.contextBuilder.build(needs, budget, context);
      if (ctxResult.ok && ctxResult.value.content) {
        parts.push(``);
        parts.push(`--- Project Context (token-budgeted, ${ctxResult.value.tokens} tokens${ctxResult.value.truncated ? ", truncated" : ""}) ---`);
        parts.push(ctxResult.value.content);
        parts.push(`--- End Context ---`);
      }
    } else {
      // Fallback: shallow context (only if no ContextBuilder injected)
      const topIssues = context.spm.issues
        .filter(i => i.severity === "critical" || i.severity === "high")
        .slice(0, 5);
      if (topIssues.length > 0) {
        parts.push(`Top issues:`);
        for (const issue of topIssues) {
          parts.push(`  - [${issue.severity}] ${issue.title} (${issue.file}:${issue.line})`);
        }
      }
    }

    parts.push(``);
    parts.push(`User request: ${query}`);

    if (attempt > 0 && lastError) {
      parts.push(``);
      parts.push(`Previous attempt failed with error:`);
      parts.push(lastError.message);
      parts.push(`Please fix the issue and generate a valid plan. Ensure the JSON is well-formed and all node IDs, dependencies, and capabilities are valid.`);
    }

    return parts.join("\n");
  }

  /** Parse AI response into ExecutionPlan */
  private parsePlan(response: string, context: AgentContext): Result<ExecutionPlan> {
    try {
      // Strip markdown fences if present
      let json = response.trim();
      if (json.startsWith("```")) {
        json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(json);

      // Build ExecutionGraph from parsed nodes
      const builder = new ExecutionGraphBuilder();
      const nodes = parsed.nodes || parsed.plan?.nodes || [];
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return err("PLAN_GENERATION_FAILED", "Plan has no nodes");
      }

      for (const node of nodes) {
        if (!node.id || !node.capability) {
          return err("PLAN_GENERATION_FAILED", `Node missing id or capability: ${JSON.stringify(node).slice(0, 200)}`);
        }
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
        ...(parsed.policy || {}),
      };

      // Estimate based on tool manifests (rough)
      const estimatedTokens = 1000 + graph.nodes.length * 500;
      const estimatedTimeMs = graph.nodes.length * 5000;

      return ok({ graph, policy, estimatedTokens, estimatedTimeMs });
    } catch (e) {
      return err(
        "PLAN_GENERATION_FAILED",
        `Failed to parse AI response as JSON: ${e instanceof Error ? e.message : String(e)}. Response was: ${response.slice(0, 300)}`,
      );
    }
  }
}

// ─── Factory ───

export function createPlanner(
  validCapabilities: Capability[],
  tools: PlannerToolInfo[] = [],
  contextBuilder: IContextBuilder | null = null,
): PlannerImpl {
  return new PlannerImpl(validCapabilities, tools, contextBuilder);
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, details, recoverable: false } };
}
