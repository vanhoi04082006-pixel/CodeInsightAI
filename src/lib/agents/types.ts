// CodeInsight AI — AI Agents: Core Types
// Simplified: agents are called DIRECTLY via /api/agents/execute — no Mission
// Control, no task queue, no scheduler, no event bus, no shared context.
// Only the types needed by the 11 specialized agent files + the execute route
// remain. Mission-specific types (AgentMessage, SharedContext, AgentDecision,
// AgentEvent, ExecutionGraph, RetryPolicy, EventBusEvent, ProgressUpdate)
// have been REMOVED.

export type AgentId =
  | "repository-analyst"
  | "code-reviewer"
  | "bug-fixer"
  | "refactoring-agent"
  | "documentation-agent"
  | "test-agent"
  | "security-agent"
  | "performance-agent"
  | "devops-agent";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskKind =
  | "analyze"
  | "review"
  | "fix-bug"
  | "refactor"
  | "document"
  | "test"
  | "security-audit"
  | "perf-audit"
  | "devops"
  | "generate-pr"
  | "custom";

export interface AgentCapability {
  kind: TaskKind;
  description: string;
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  icon: string;
  color: string;
}

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  input: Record<string, any>;
  createdAt: string;
}

export interface TaskResult {
  success: boolean;
  data: any;
  summary: string;
  artifacts: TaskArtifact[];
  metrics?: Record<string, number>;
  followUpTasks?: Partial<Task>[];
}

export interface TaskArtifact {
  kind: "file" | "diff" | "log" | "report" | "command-output" | "test-result";
  path?: string;
  content: string;
  language?: string;
  meta?: Record<string, any>;
}
