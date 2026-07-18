// CodeInsight AI — Multi-Agent System Core Types
// Phase 3: Autonomous AI Software Engineer

export type AgentId =
  | "orchestrator"
  | "planner"
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
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskKind =
  | "analyze"
  | "plan"
  | "review"
  | "fix-bug"
  | "refactor"
  | "document"
  | "test"
  | "security-audit"
  | "perf-audit"
  | "devops"
  | "edit-file"
  | "run-command"
  | "git-op"
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
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent?: AgentId;
  dependencies: string[];
  input: Record<string, any>;
  output?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  error?: string;
  progress: number;
  progressMessage?: string;
  parentTaskId?: string;
  subtaskIds: string[];
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

export interface AgentMessage {
  id: string;
  from: AgentId;
  to: AgentId | "broadcast";
  type: "task-update" | "request-help" | "share-context" | "report-error" | "notify-complete" | "query";
  payload: any;
  timestamp: number;
}

export interface SharedContext {
  taskId: string;
  repositoryPath?: string;
  repositoryUrl?: string;
  analysisReport?: any;
  workingFiles: Map<string, string>;
  memory: Map<string, any>;
  decisions: AgentDecision[];
  events: AgentEvent[];
}

export interface AgentDecision {
  id: string;
  agent: AgentId;
  decision: string;
  rationale: string;
  timestamp: number;
}

export interface AgentEvent {
  id: string;
  type: string;
  agent: AgentId;
  message: string;
  level: "info" | "warn" | "error" | "debug";
  timestamp: number;
  data?: any;
}

// ── Execution Graph (Planner output) ──
export interface ExecutionGraph {
  id: string;
  goal: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  estimatedDurationMs: number;
  estimatedComplexity: number;
  parallelizable: boolean;
}

export interface ExecutionNode {
  id: string;
  taskId: string;
  agent: AgentId;
  kind: TaskKind;
  title: string;
  priority: TaskPriority;
  dependencies: string[];
  estimatedMs: number;
  estimatedDifficulty: number;
  canRetry: boolean;
  rollbackAction?: string;
}

export interface ExecutionEdge {
  from: string;
  to: string;
  type: "dependency" | "data-flow" | "rollback";
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [],
};

export interface ProgressUpdate {
  taskId: string;
  progress: number;
  message: string;
  timestamp: number;
}

export type EventBusEvent =
  | { type: "task:created"; task: Task }
  | { type: "task:started"; task: Task }
  | { type: "task:progress"; taskId: string; progress: number; message: string }
  | { type: "task:completed"; task: Task }
  | { type: "task:failed"; task: Task; error: string }
  | { type: "task:cancelled"; taskId: string }
  | { type: "task:retrying"; task: Task; attempt: number }
  | { type: "agent:message"; message: AgentMessage }
  | { type: "agent:event"; event: AgentEvent }
  | { type: "graph:created"; graph: ExecutionGraph }
  | { type: "graph:node-complete"; nodeId: string; result: TaskResult }
  | { type: "log"; level: "info" | "warn" | "error" | "debug"; message: string; agent?: AgentId };
