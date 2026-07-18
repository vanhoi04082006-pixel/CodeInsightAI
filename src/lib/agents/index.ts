// CodeInsight AI — Multi-Agent System: Central Registration
// Import this module once (e.g. in an API route or at app boot) to activate all agents.

import { taskQueue } from "./task-queue";
import { AGGRESSIVE_RETRY, NO_RETRY } from "./retry-policy";
import { eventBus } from "./event-bus";

import { plannerAgent } from "./planner";
import { orchestratorAgent } from "./orchestrator";
import { repositoryAnalystAgent } from "./repository-analyst";
import { codeReviewerAgent } from "./code-reviewer";
import { bugFixerAgent } from "./bug-fixer";
import { refactoringAgent } from "./refactoring-agent";
import { documentationAgent } from "./documentation-agent";
import { testAgent } from "./test-agent";
import { securityAgent } from "./security-agent";
import { performanceAgent } from "./performance-agent";
import { devopsAgent } from "./devops-agent";

import type { TaskKind } from "./types";

let registered = false;

/** Register all agents + their task-kind handlers. Safe to call multiple times. */
export function registerAllAgents(): void {
  if (registered) return;
  registered = true;

  // ── Register agents with the registry ──
  plannerAgent.register(["plan"]);
  orchestratorAgent.register(["custom"]);
  repositoryAnalystAgent.register(["analyze"]);
  codeReviewerAgent.register(["review"]);
  bugFixerAgent.register(["fix-bug"]);
  refactoringAgent.register(["refactor"]);
  documentationAgent.register(["document"]);
  testAgent.register(["test"]);
  securityAgent.register(["security-audit"]);
  performanceAgent.register(["perf-audit"]);
  devopsAgent.register(["devops"]);

  // ── Wire task-kind handlers to the task queue ──
  // Each handler delegates to the corresponding agent via the registry.
  const wire = (kind: TaskKind, retry = AGGRESSIVE_RETRY) => {
    taskQueue.registerHandler(kind, async (task, signal, onProgress) => {
      const agent = kind === "custom" ? orchestratorAgent
        : kind === "plan" ? plannerAgent
        : kind === "analyze" ? repositoryAnalystAgent
        : kind === "review" ? codeReviewerAgent
        : kind === "fix-bug" ? bugFixerAgent
        : kind === "refactor" ? refactoringAgent
        : kind === "document" ? documentationAgent
        : kind === "test" ? testAgent
        : kind === "security-audit" ? securityAgent
        : kind === "perf-audit" ? performanceAgent
        : kind === "devops" ? devopsAgent
        : null;
      if (!agent) {
        return { success: false, data: null, summary: `No agent for kind "${kind}"`, artifacts: [] };
      }
      return agent.run(task, signal, onProgress);
    }, retry);
  };

  wire("plan");
  wire("custom", NO_RETRY);  // orchestration shouldn't retry the whole graph
  wire("analyze");
  wire("review");
  wire("fix-bug");
  wire("refactor");
  wire("document");
  wire("test");
  wire("security-audit");
  wire("perf-audit");
  wire("devops");

  eventBus.emit({
    type: "log",
    level: "info",
    message: "[agent-system] All 11 agents registered and wired to task queue",
  });
}

// ── Re-export everything for convenience ──
export * from "./types";
export { eventBus } from "./event-bus";
export { taskQueue } from "./task-queue";
export { agentRegistry } from "./agent-registry";
export { agentScheduler } from "./agent-scheduler";
export { contextRegistry } from "./shared-context";
export { messageBus } from "./message-bus";
export { repositoryMemory } from "./repository-memory";
export { BaseAgent } from "./base-agent";
export { callAI, callAIForJSON, streamAI } from "./ai-client";
export type { AIProviderConfig, AIMessage } from "./ai-client";

export { plannerAgent } from "./planner";
export { orchestratorAgent, runAutonomousWorkflow } from "./orchestrator";
export { repositoryAnalystAgent } from "./repository-analyst";
export { codeReviewerAgent } from "./code-reviewer";
export { bugFixerAgent } from "./bug-fixer";
export { refactoringAgent } from "./refactoring-agent";
export { documentationAgent } from "./documentation-agent";
export { testAgent } from "./test-agent";
export { securityAgent } from "./security-agent";
export { performanceAgent } from "./performance-agent";
export { devopsAgent } from "./devops-agent";
export { prGenerator, formatPRAsMarkdown } from "./pr-generator";
