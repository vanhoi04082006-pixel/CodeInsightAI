// CodeInsight AI — AI Agents (direct call, no direct-call)
//
// direct-call backend has been REMOVED: no orchestrator, no scheduler, no
// task queue, no event bus, no shared context, no message bus, no registry,
// no repository memory, no event persister, no retry policy, no planner, no
// executive subfolder.
//
// The 10 specialized agents below are called DIRECTLY by /api/agents/execute
// via their `run(task, signal, onProgress)` method. No registration step.
// No polling endpoint. The frontend gets the result inline in the POST
// response.

// ── Base class + types ──
export { BaseAgent } from "./base-agent";
export type {
  AgentId,
  AgentInfo,
  AgentCapability,
  Task,
  TaskResult,
  TaskArtifact,
  TaskKind,
  TaskStatus,
  TaskPriority,
} from "./types";

// ── Shared AI client (also used by analysis + chat) ──
export { callAI, callAIForJSON, streamAI } from "./ai-client";
export type { AIProviderConfig, AIMessage } from "./ai-client";

// ── 10 specialized agents ──
export { BugFixerAgent, bugFixerAgent } from "./bug-fixer";
export { TestAgent, testAgent } from "./test-agent";
export { RefactoringAgent, refactoringAgent } from "./refactoring-agent";
export { SecurityAgent, securityAgent } from "./security-agent";
export { PerformanceAgent, performanceAgent } from "./performance-agent";
export { DocumentationAgent, documentationAgent } from "./documentation-agent";
export { CodeReviewerAgent, codeReviewerAgent } from "./code-reviewer";
export { RepositoryAnalystAgent, repositoryAnalystAgent } from "./repository-analyst";
export { DevOpsAgent, devopsAgent } from "./devops-agent";
export { PRGenerator, prGenerator, formatPRAsMarkdown } from "./pr-generator";
export type {
  CommitInfo as PRCommitInfo,
  ProjectInfo as PRProjectInfo,
  PRDescription,
} from "./pr-generator";
