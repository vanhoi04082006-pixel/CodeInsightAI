// CodeInsight AI — Planner Agent
// Phase 3: Autonomous AI Software Engineer
//
// Takes a high-level user goal and produces an ExecutionGraph that the
// agent-scheduler can run. Uses an LLM (when a provider is supplied) to
// break the goal into ordered tasks, and falls back to a rule-based
// pipeline (analyze → review → fix-bugs → document → test) otherwise.

import type {
  AgentCapability,
  AgentId,
  AgentInfo,
  ExecutionEdge,
  ExecutionGraph,
  ExecutionNode,
  Task,
  TaskKind,
  TaskPriority,
  TaskResult,
} from "./types";
import { BaseAgent } from "./base-agent";
import { contextRegistry } from "./shared-context";
import { callAIForJSON, type AIProviderConfig, type AIMessage } from "./ai-client";

// ── LLM response shape ──────────────────────────────────────────────────────
interface LLMPlanTask {
  agent: string;
  kind: string;
  title: string;
  priority?: string;
  dependencies?: number[];
  estimatedMs?: number;
  estimatedDifficulty?: number;
  canRetry?: boolean;
  rollbackAction?: string | null;
}

interface LLMPlan {
  tasks: LLMPlanTask[];
  estimatedComplexity?: number;
  parallelizable?: boolean;
}

// ── Allowed agent / kind / priority sets (validated against the union types) ──
const VALID_AGENTS: ReadonlySet<string> = new Set<AgentId>([
  "orchestrator",
  "planner",
  "repository-analyst",
  "code-reviewer",
  "bug-fixer",
  "refactoring-agent",
  "documentation-agent",
  "test-agent",
  "security-agent",
  "performance-agent",
  "devops-agent",
]);

const VALID_KINDS: ReadonlySet<string> = new Set<TaskKind>([
  "analyze",
  "plan",
  "review",
  "fix-bug",
  "refactor",
  "document",
  "test",
  "security-audit",
  "perf-audit",
  "devops",
  "edit-file",
  "run-command",
  "git-op",
  "generate-pr",
  "custom",
]);

const VALID_PRIORITIES: ReadonlySet<string> = new Set<TaskPriority>([
  "critical",
  "high",
  "medium",
  "low",
]);

function safeAgent(a: unknown): AgentId | null {
  return typeof a === "string" && VALID_AGENTS.has(a) ? (a as AgentId) : null;
}

function safeKind(k: unknown): TaskKind | null {
  return typeof k === "string" && VALID_KINDS.has(k) ? (k as TaskKind) : null;
}

function safePriority(p: unknown): TaskPriority {
  return typeof p === "string" && VALID_PRIORITIES.has(p) ? (p as TaskPriority) : "medium";
}

function clampPositive(n: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ── Planner Agent ───────────────────────────────────────────────────────────
class PlannerAgent extends BaseAgent {
  readonly id: AgentId = "planner";
  readonly info: AgentInfo = {
    id: "planner",
    name: "Planner",
    description: "Breaks down goals into executable task graphs",
    capabilities: [
      { kind: "plan", description: "Decompose a high-level goal into a DAG of agent tasks" },
    ] as AgentCapability[],
    icon: "ListTodo",
    color: "#a78bfa",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const goal: string = typeof task.input?.goal === "string" ? task.input.goal : "";
    const repositoryUrl: string | undefined =
      typeof task.input?.repositoryUrl === "string" ? task.input.repositoryUrl : undefined;
    const provider: AIProviderConfig | undefined = task.input?.provider as AIProviderConfig | undefined;

    if (!goal) {
      return {
        success: false,
        data: null,
        summary: "Planner failed: no goal provided in task.input.goal",
        artifacts: [],
      };
    }

    this.log("info", `Planning tasks for goal: "${goal}"${repositoryUrl ? ` (repo: ${repositoryUrl})` : ""}`);
    onProgress(10, "Analyzing goal");

    let graph: ExecutionGraph;

    if (provider && provider.apiKey && provider.baseUrl && provider.model) {
      try {
        if (signal.aborted) throw new Error("Aborted before LLM call");
        onProgress(25, "Asking LLM to decompose goal");
        graph = await this.planWithLLM(goal, repositoryUrl, provider, signal, onProgress);
        this.log("info", `LLM plan produced ${graph.nodes.length} nodes`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (signal.aborted) {
          return {
            success: false,
            data: null,
            summary: "Planner cancelled",
            artifacts: [],
          };
        }
        this.log("warn", `LLM planning failed (${msg}); falling back to rule-based planner`);
        onProgress(60, "Falling back to rule-based planner");
        graph = this.ruleBasedPlan(goal, repositoryUrl);
      }
    } else {
      this.log("info", "No AI provider supplied — using rule-based planner");
      onProgress(40, "Building standard pipeline (rule-based)");
      graph = this.ruleBasedPlan(goal, repositoryUrl);
    }

    // Persist graph in the shared context for the orchestrator / scheduler to read.
    contextRegistry.setMemory(task.id, "executionGraph", graph);
    contextRegistry.recordEvent(
      task.id,
      this.id,
      "plan-complete",
      `Execution graph built with ${graph.nodes.length} nodes (parallelizable=${graph.parallelizable})`,
      "info",
      { nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
    );

    onProgress(100, `Planned ${graph.nodes.length} tasks`);

    return {
      success: true,
      data: graph,
      summary: `Planned ${graph.nodes.length} tasks for goal: ${goal}`,
      artifacts: [
        {
          kind: "report",
          content: JSON.stringify(graph, null, 2),
          language: "json",
          meta: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
        },
      ],
      metrics: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        estimatedComplexity: graph.estimatedComplexity,
        estimatedDurationMs: graph.estimatedDurationMs,
      },
    };
  }

  // ── LLM-driven planning ──────────────────────────────────────────────────
  private async planWithLLM(
    goal: string,
    repositoryUrl: string | undefined,
    provider: AIProviderConfig,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<ExecutionGraph> {
    const systemPrompt = [
      "You are the Planner agent of CodeInsight AI — an autonomous AI software-engineering platform.",
      "Given a high-level user goal, decompose it into a dependency-ordered list of tasks that specialist agents can execute.",
      "",
      "Available specialist agents (use these EXACT agent IDs):",
      "  - repository-analyst  (kind: analyze)        — deep repository analysis",
      "  - code-reviewer       (kind: review)         — code review & issue detection",
      "  - bug-fixer           (kind: fix-bug)        — applies bug fixes",
      "  - refactoring-agent   (kind: refactor)       — refactors code for maintainability",
      "  - documentation-agent (kind: document)       — generates documentation",
      "  - test-agent          (kind: test)           — writes / runs tests",
      "  - security-agent      (kind: security-audit) — security audit",
      "  - performance-agent   (kind: perf-audit)     — performance audit",
      "  - devops-agent        (kind: devops)         — CI/CD, deployment, infra",
      "  - bug-fixer           (kind: edit-file)      — direct file edits",
      "  - devops-agent        (kind: run-command)    — runs shell commands",
      "  - devops-agent        (kind: git-op)         — git operations",
      "  - devops-agent        (kind: generate-pr)    — opens a pull request",
      "",
      "Respond with STRICT JSON of this exact shape (no markdown, no comments):",
      "{",
      '  "tasks": [',
      "    {",
      '      "agent": "repository-analyst",',
      '      "kind": "analyze",',
      '      "title": "Analyze repository structure",',
      '      "priority": "high",            // critical | high | medium | low',
      '      "dependencies": [],             // 1-based indices into this tasks array',
      '      "estimatedMs": 30000,           // milliseconds',
      '      "estimatedDifficulty": 3,        // 1..5',
      '      "canRetry": true,',
      '      "rollbackAction": null          // string | null',
      "    }",
      "  ],",
      '  "estimatedComplexity": 5,           // 1..10',
      '  "parallelizable": true              // boolean',
      "}",
      "",
      "Rules:",
      "1. The first task should usually be `analyze` (repository-analyst) when a repositoryUrl is supplied.",
      "2. Dependencies MUST reference earlier tasks by 1-based index (e.g. [1] means depends on tasks[0]).",
      "3. Keep tasks atomic — one concern per task. Aim for 3-8 tasks total.",
      "4. Only use agent IDs and kinds from the list above.",
      "5. Set `parallelizable: true` if at least two tasks have no inter-dependency.",
    ].join("\n");

    const userPrompt = [
      `GOAL: ${goal}`,
      repositoryUrl ? `REPOSITORY: ${repositoryUrl}` : "REPOSITORY: (none supplied)",
      "",
      "Decompose this goal into an execution plan now.",
    ].join("\n");

    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    onProgress(45, "Waiting for LLM response");
    const plan = await callAIForJSON<LLMPlan>(provider, messages, {
      temperature: 0.2,
      maxTokens: 2000,
      signal,
    });

    onProgress(75, "Validating LLM plan");
    return this.buildGraphFromLLMPlan(goal, plan);
  }

  private buildGraphFromLLMPlan(goal: string, plan: LLMPlan): ExecutionGraph {
    const rawTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
    const nodes: ExecutionNode[] = [];
    const edges: ExecutionEdge[] = [];
    // Map 1-based index → nodeId for dependency resolution.
    const indexToNodeId = new Map<number, string>();

    rawTasks.forEach((t, i) => {
      const idx = i + 1;
      const nodeId = `node_${idx}`;
      indexToNodeId.set(idx, nodeId);

      const agent = safeAgent(t.agent) ?? "devops-agent";
      const kind = safeKind(t.kind) ?? "custom";
      const deps: string[] = Array.isArray(t.dependencies)
        ? t.dependencies
            .map(d => (typeof d === "number" && d > 0 && d <= rawTasks.length ? `node_${d}` : null))
            .filter((d): d is string => d !== null)
        : [];

      nodes.push({
        id: nodeId,
        taskId: "", // scheduler assigns real task id at enqueue time
        agent,
        kind,
        title: typeof t.title === "string" && t.title.length > 0 ? t.title : `${kind} task`,
        priority: safePriority(t.priority),
        dependencies: deps,
        estimatedMs: clampPositive(t.estimatedMs, 30000, 1000, 60 * 60 * 1000),
        estimatedDifficulty: clampPositive(t.estimatedDifficulty, 3, 1, 5),
        canRetry: typeof t.canRetry === "boolean" ? t.canRetry : true,
        rollbackAction: typeof t.rollbackAction === "string" ? t.rollbackAction : undefined,
      });
    });

    // Build dependency edges.
    for (const node of nodes) {
      for (const depId of node.dependencies) {
        if (nodes.some(n => n.id === depId)) {
          edges.push({ from: depId, to: node.id, type: "dependency" });
        }
      }
    }

    const estimatedDurationMs = nodes.reduce((sum, n) => sum + n.estimatedMs, 0);
    const parallelizable =
      typeof plan.parallelizable === "boolean"
        ? plan.parallelizable
        : nodes.some(n => n.dependencies.length === 0) && nodes.length > 1;

    return {
      id: `graph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      goal,
      nodes,
      edges,
      estimatedDurationMs,
      estimatedComplexity: clampPositive(plan.estimatedComplexity, nodes.length, 1, 10),
      parallelizable,
    };
  }

  // ── Rule-based fallback ──────────────────────────────────────────────────
  private ruleBasedPlan(goal: string, repositoryUrl: string | undefined): ExecutionGraph {
    const nodes: ExecutionNode[] = [];
    const edges: ExecutionEdge[] = [];

    const mk = (
      idx: number,
      agent: AgentId,
      kind: TaskKind,
      title: string,
      priority: TaskPriority,
      deps: string[],
      estimatedMs: number,
      estimatedDifficulty: number,
    ): ExecutionNode => ({
      id: `node_${idx}`,
      taskId: "",
      agent,
      kind,
      title,
      priority,
      dependencies: deps,
      estimatedMs,
      estimatedDifficulty,
      canRetry: true,
      rollbackAction: undefined,
    });

    // Standard pipeline: analyze → review → (fix-bugs) → document / test
    if (repositoryUrl) {
      nodes.push(mk(1, "repository-analyst", "analyze", "Analyze repository structure", "high", [], 30000, 3));
      nodes.push(mk(2, "code-reviewer", "review", "Review code for issues", "high", ["node_1"], 45000, 4));
      nodes.push(mk(3, "bug-fixer", "fix-bug", "Fix bugs found during review", "medium", ["node_2"], 60000, 4));
      nodes.push(mk(4, "documentation-agent", "document", "Generate / update documentation", "medium", ["node_2"], 30000, 2));
      nodes.push(mk(5, "test-agent", "test", "Generate and run tests", "medium", ["node_2"], 45000, 3));
      edges.push({ from: "node_1", to: "node_2", type: "dependency" });
      edges.push({ from: "node_2", to: "node_3", type: "dependency" });
      edges.push({ from: "node_2", to: "node_4", type: "dependency" });
      edges.push({ from: "node_2", to: "node_5", type: "dependency" });
    } else {
      // No repository — only generic tasks.
      nodes.push(mk(1, "code-reviewer", "review", "Review code for issues", "high", [], 30000, 3));
      nodes.push(mk(2, "documentation-agent", "document", "Generate documentation", "medium", ["node_1"], 25000, 2));
      nodes.push(mk(3, "test-agent", "test", "Generate and run tests", "medium", ["node_1"], 40000, 3));
      edges.push({ from: "node_1", to: "node_2", type: "dependency" });
      edges.push({ from: "node_1", to: "node_3", type: "dependency" });
    }

    const estimatedDurationMs = nodes.reduce((sum, n) => sum + n.estimatedMs, 0);
    return {
      id: `graph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      goal,
      nodes,
      edges,
      estimatedDurationMs,
      estimatedComplexity: Math.min(10, nodes.length + 1),
      parallelizable: nodes.length > 1,
    };
  }
}

export const plannerAgent = new PlannerAgent();
export { PlannerAgent };
