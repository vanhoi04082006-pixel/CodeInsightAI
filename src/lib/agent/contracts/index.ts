// CodeInsight AI — Agent Architecture Contracts (Phase 0)
//
// This file defines ALL interfaces, types, and conventions for the Agent system.
// NO IMPLEMENTATION here — only contracts. Phases 1-10 implement against these.
//
// "Frozen" on approval. Changes require explicit version bump.

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Result Model
// Every operation returns Result<T> — never throws (except programmer errors)
// ═══════════════════════════════════════════════════════════════

export type Result<T, E = AgentError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface AgentError {
  code: string;              // "TOOL_TIMEOUT", "PERMISSION_DENIED", "PARSE_ERROR"
  message: string;           // human-readable
  details?: unknown;         // structured context for debugging
  recoverable: boolean;      // can Runtime retry/skip?
  cause?: AgentError;        // chain
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Semantic Project Model (pure data — no logic)
// ═══════════════════════════════════════════════════════════════

export interface SemanticProjectModel {
  // Identity
  readonly id: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly createdAt: string;

  // Core data (populated by Parser, read-only after build)
  readonly files: readonly SemanticFile[];
  readonly symbols: readonly SemanticSymbol[];
  readonly edges: readonly SemanticEdge[];
  readonly issues: readonly SemanticIssue[];
  readonly insights: readonly SemanticInsight[];
  readonly architecture: SemanticArchitecture;
  readonly metrics: SemanticMetrics;

  // Versioning (for cache invalidation)
  readonly schemaVersion: number;
}

export interface SemanticFile {
  path: string;
  language: string;
  lines: number;
  content: string;        // full source
  symbols: string[];      // symbol IDs declared in this file
  imports: string[];      // file paths imported
}

export interface SemanticSymbol {
  id: string;             // unique: `${file}::${name}::${kind}`
  name: string;
  kind: "function" | "class" | "variable" | "import" | "route" | "component" | "type" | "interface";
  file: string;
  line: number;
  endLine?: number;
  exported: boolean;
  parameters?: { name: string; type: string; optional?: boolean }[];
  returnType?: string;
}

export interface SemanticEdge {
  id: string;
  type: "imports" | "calls" | "extends" | "implements" | "uses" | "depends_on" | "exports";
  source: string;         // symbol ID
  target: string;         // symbol ID or file path
  file?: string;          // where edge originates
  line?: number;
}

export interface SemanticIssue {
  id: string;
  category: "security" | "bugs" | "performance" | "architecture" | "style";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  file: string;
  line: number;
  recommendation: string;
  effort: "trivial" | "small" | "medium" | "large";
  // AI-enhanced fields (optional)
  evidence?: string[];
  confidence?: number;    // 0.0-1.0
  fixPlan?: string[];
}

export interface SemanticInsight {
  type: "overview" | "summary" | "security" | "architecture" | "quality" | "performance" | "priorities" | "bestPractices" | "duplicates";
  data: unknown;          // type-specific structured data
  confidence?: number;
}

export interface SemanticArchitecture {
  pattern: string;
  strengths: string[];
  weaknesses: string[];
  layers: string[];
  layerViolations: string[];
}

export interface SemanticMetrics {
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  totalEdges: number;
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  couplingScore: number;
  cohesionScore: number;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Index System (O(1) lookups)
// ═══════════════════════════════════════════════════════════════

export interface IndexSystem {
  symbol: SymbolIndex;
  reference: ReferenceIndex;
  call: CallIndex;
  import: ImportIndex;
  issue: IssueIndex;
  path: PathIndex;
}

export interface SymbolIndex {
  byName(name: string): SemanticSymbol[];        // O(1)
  byId(id: string): SemanticSymbol | null;       // O(1)
  byFile(file: string): SemanticSymbol[];        // O(1)
  byKind(kind: SemanticSymbol["kind"]): SemanticSymbol[];
}

export interface ReferenceIndex {
  referencesTo(symbolId: string): SemanticEdge[];   // O(1) — who calls/uses this
  referencesFrom(symbolId: string): SemanticEdge[];  // O(1) — what this calls/uses
}

export interface CallIndex {
  callers(symbolId: string): SemanticSymbol[];   // O(1) — direct callers
  callees(symbolId: string): SemanticSymbol[];   // O(1) — direct callees
  callChain(entry: string, maxDepth: number): CallChainNode[];
}

export interface CallChainNode {
  symbol: SemanticSymbol;
  depth: number;
  children: CallChainNode[];
}

export interface ImportIndex {
  importsByFile(file: string): SemanticEdge[];   // O(1) — what this file imports
  importedByFile(file: string): SemanticEdge[];  // O(1) — who imports this file
  importChain(file: string): string[];           // transitive import chain
}

export interface IssueIndex {
  byFile(file: string): SemanticIssue[];         // O(1)
  byCategory(cat: SemanticIssue["category"]): SemanticIssue[];
  bySeverity(sev: SemanticIssue["severity"]): SemanticIssue[];
  bySymbol(symbolId: string): SemanticIssue[];   // issues affecting a symbol
}

export interface PathIndex {
  shortestPath(from: string, to: string): string[] | null;  // BFS
  allPaths(from: string, to: string, maxDepth: number): string[][];
  cyclicDependencies(): string[][];   // all cycles
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Semantic Query Service (business logic — reads SPM + Indexes)
// ═══════════════════════════════════════════════════════════════

export interface SemanticQueryService {
  // Symbol queries
  findSymbol(name: string): Result<SemanticSymbol[]>;
  findDefinition(symbolId: string): Result<SemanticSymbol | null>;
  findReferences(symbolId: string): Result<SemanticEdge[]>;
  findCallers(symbolId: string): Result<SemanticSymbol[]>;
  findCallees(symbolId: string): Result<SemanticSymbol[]>;
  findCallChain(entry: string, maxDepth?: number): Result<CallChainNode>;

  // Impact analysis
  findImpact(symbolId: string): Result<ImpactReport>;

  // Code queries
  searchCode(query: string, options?: SearchOptions): Result<SemanticFile[]>;
  findFile(path: string): Result<SemanticFile | null>;
  findDeadCode(): Result<SemanticSymbol[]>;
  findDuplicates(): Result<DuplicateGroup[]>;

  // Issue queries
  findIssues(filter: IssueFilter): Result<SemanticIssue[]>;
  findIssuesByFile(file: string): Result<SemanticIssue[]>;
  findIssuesBySymbol(symbolId: string): Result<SemanticIssue[]>;

  // Architecture queries
  getArchitecture(): Result<SemanticArchitecture>;
  getMetrics(): Result<SemanticMetrics>;
  findCircularDependencies(): Result<string[][]>;

  // Diagram queries
  getDiagram(type: string, options?: DiagramOptions): Result<unknown>;
}

export interface ImpactReport {
  root: SemanticSymbol;
  directlyImpacted: SemanticSymbol[];
  transitivelyImpacted: SemanticSymbol[];
  filesAffected: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface SearchOptions {
  filePattern?: string;       // glob
  language?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  limit?: number;
}

export interface IssueFilter {
  category?: SemanticIssue["category"];
  severity?: SemanticIssue["severity"];
  file?: string;
  symbolId?: string;
}

export interface DuplicateGroup {
  id: string;
  files: string[];
  lines: number;
  estimatedLinesSaved: number;
  pattern: string;
}

export interface DiagramOptions {
  layout?: "dagre-tb" | "dagre-lr" | "force" | "tree";
  format?: "svg" | "mermaid" | "plantuml";
  focus?: string;            // symbol/file to center on
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Service Layer (wraps existing engines + SPM)
// ═══════════════════════════════════════════════════════════════

export interface GraphService {
  buildGraph(spm: SemanticProjectModel): Result<GraphData>;
  findPath(from: string, to: string): Result<string[] | null>;
  findCycles(): Result<string[][]>;
  getStats(): Result<GraphStats>;
}

export interface DiagramService {
  generate(type: string, spm: SemanticProjectModel, options?: DiagramOptions): Result<unknown>;
  export(diagram: unknown, format: string): Result<string>;
}

export interface SearchService {
  search(query: string, spm: SemanticProjectModel, options?: SearchOptions): Result<SearchResult[]>;
  index(spm: SemanticProjectModel): Result<void>;
}

export interface GitService {
  diff(filePath?: string): Result<string>;
  commit(message: string, files?: string[]): Result<string>;
  push(): Result<void>;
  history(file: string, limit?: number): Result<GitCommit[]>;
  revert(commitSha: string): Result<void>;
}

export interface RepoService {
  readFile(path: string): Result<string>;
  writeFile(path: string, content: string): Result<void>;
  deleteFile(path: string): Result<void>;
  moveFile(from: string, to: string): Result<void>;
  applyPatch(patch: string): Result<string[]>;
  rollback(changes: ChangeRecord[]): Result<void>;
}

export interface AIInsightService {
  getInsight(type: string, spm: SemanticProjectModel): Result<SemanticInsight | null>;
  generateInsight(type: string, context: AgentContext): Result<SemanticInsight>;
}

export interface GraphData { nodes: unknown[]; edges: unknown[]; }
export interface GraphStats { totalNodes: number; totalEdges: number; avgConnectivity: number; }
export interface SearchResult { file: string; line: number; text: string; score: number; }
export interface GitCommit { sha: string; message: string; author: string; date: string; }
export interface ChangeRecord { file: string; type: "create" | "update" | "delete"; oldContent?: string; }

// ═══════════════════════════════════════════════════════════════
// SECTION 6: Capability Registry (abstract — "I need X")
// ═══════════════════════════════════════════════════════════════

export type Capability =
  | "find-symbol"
  | "find-references"
  | "find-call-chain"
  | "find-impact"
  | "search-code"
  | "open-file"
  | "read-file"
  | "find-dead-code"
  | "find-duplicates"
  | "find-issues"
  | "find-architecture"
  | "find-metrics"
  | "find-circular-deps"
  | "get-diagram"
  | "generate-patch"
  | "apply-patch"
  | "rollback-changes"
  | "run-lint"
  | "run-tests"
  | "run-script"
  | "git-diff"
  | "git-commit"
  | "git-push"
  | "git-history"
  | "git-revert"
  | "ai-insight"
  | "ai-chat"
  // Stage 4 — Web Agent capabilities (internet research)
  | "web-search"
  | "github-search"
  | "stackoverflow-search"
  | "npm-search"
  | "crate-search"
  | "nuget-search"
  | "pypi-search"
  | "read-docs"
  | "cve-search";

export interface CapabilityRegistry {
  // Register: capability → list of tools that can fulfill it
  register(capability: Capability, toolName: string, priority: number): void;
  // Resolve: given a capability, return best tool (by priority + availability)
  resolve(capability: Capability): string | null;
  // List all capabilities a tool provides
  capabilitiesOf(toolName: string): Capability[];
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: Tool Registry + Tool Manifest
// ═══════════════════════════════════════════════════════════════

export interface ToolManifest {
  name: string;
  description: string;
  capabilities: Capability[];          // what this tool can do

  // Cost model — Planner uses for optimization
  cost: "cheap" | "medium" | "expensive";
  estimatedTimeMs: number;

  // Execution constraints
  permission: PermissionLevel;         // "allow" | "prompt" | "deny"
  timeout: number;                     // ms

  // Parallelism
  parallel: boolean;                   // can multiple instances run simultaneously?
  parallelSafe: boolean;               // safe to run alongside other tools?

  // Caching
  cacheable: boolean;
  cacheTtl: number;                    // ms

  // Streaming
  streamable: boolean;                 // supports partial output streaming?

  // Reliability
  confidence: number;                  // 0.0-1.0 — expected reliability
  maxRetries: number;

  // Schema
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}

export type PermissionLevel = "allow" | "prompt" | "deny";

export interface JSONSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
}

export interface Tool {
  manifest: ToolManifest;
  execute(params: Record<string, unknown>, context: AgentContext): Promise<Result<unknown>>;
  // Streaming variant (if streamable=true)
  stream?(params: Record<string, unknown>, context: AgentContext): AsyncGenerator<ToolStreamChunk>;
}

export interface ToolStreamChunk {
  type: "partial" | "complete" | "error";
  data?: string;
  error?: string;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | null;
  getManifest(name: string): ToolManifest | null;
  listByCapability(capability: Capability): ToolManifest[];
  listByPermission(level: PermissionLevel): ToolManifest[];
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: Context Builder + Token Budget
// ═══════════════════════════════════════════════════════════════

export interface AgentContext {
  spm: SemanticProjectModel;
  query: SemanticQueryService;
  memory: AgentMemory;
  analysisId: string | null;
  locale: "en" | "vi";
}

export interface ContextBuilder {
  build(
    needs: ContextNeed[],
    budget: TokenBudget,
    context: AgentContext
  ): Result<AgentContextPayload>;
}

export interface ContextNeed {
  type: "file" | "symbol" | "graph" | "issues" | "architecture" | "insight" | "diff";
  ref: string;               // file path, symbol ID, etc.
  priority: "critical" | "important" | "nice-to-have";
  maxTokens?: number;        // optional cap for this piece
}

export interface AgentContextPayload {
  content: string;            // assembled context string for LLM
  tokens: number;             // actual token count
  allocations: TokenAllocation[];
  truncated: boolean;         // was anything dropped?
}

export interface TokenBudget {
  total: number;              // model limit (e.g. 128000)
  reserved: number;           // for response (e.g. 8000)
  available: number;          // total - reserved
}

export interface TokenAllocation {
  need: ContextNeed;
  estimatedTokens: number;
  actualTokens: number;
  included: boolean;
}

export interface TokenBudgetManager {
  estimate(content: string): number;
  allocate(needs: ContextNeed[], budget: TokenBudget): TokenAllocation[];
  canFit(allocation: TokenAllocation, remaining: number): boolean;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9: Planner — Execution Graph (DAG) + Execution Policy
// ═══════════════════════════════════════════════════════════════

export interface Planner {
  plan(query: string, context: AgentContext): Promise<Result<ExecutionPlan>>;
}

export interface ExecutionPlan {
  graph: ExecutionGraph;     // DAG of steps
  policy: ExecutionPolicy;   // global rules
  estimatedTokens: number;
  estimatedTimeMs: number;
}

export interface ExecutionGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];
  entryPoints: string[];     // node IDs with no dependencies
}

export interface PlanNode {
  id: string;
  step: string;              // human-readable description
  capability: Capability;    // what this step needs
  toolName?: string;         // resolved tool (or null → Runtime resolves)
  params: Record<string, unknown>;
  dependsOn: string[];       // node IDs that must complete first
  parallelGroup?: string;    // nodes in same group can run in parallel
  nodePolicy?: Partial<ExecutionPolicy>;  // override global policy
  status: NodeStatus;
  result?: unknown;
  error?: AgentError;
  startedAt?: number;
  completedAt?: number;
}

export type NodeStatus = "pending" | "running" | "awaiting-permission" | "done" | "failed" | "skipped" | "cancelled";

export interface PlanEdge {
  from: string;
  to: string;
  type: "dependency" | "data-flow";
}

export interface ExecutionPolicy {
  maxParallel: number;       // max concurrent nodes (default: 3)
  defaultTimeout: number;    // ms per node
  defaultRetries: number;    // retry count on transient failure
  tokenBudget: TokenBudget;
  continueOnFailure: boolean;   // if a node fails, continue siblings?
  rollbackOnFailure: boolean;   // rollback file changes if plan fails?
  requireConfirmationFor: PermissionLevel[];  // which permission levels need UI prompt
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10: Agent Runtime (Event-Driven)
// ═══════════════════════════════════════════════════════════════

export interface AgentRuntime {
  run(plan: ExecutionPlan, context: AgentContext): AsyncGenerator<AgentEvent>;
  cancel(taskId: string): void;
  pause(taskId: string): void;
  resume(taskId: string): AsyncGenerator<AgentEvent>;
  getCheckpoint(taskId: string): Checkpoint | null;
}

export interface EventBus {
  emit(event: AgentEvent): void;
  subscribe(handler: (event: AgentEvent) => void): () => void;
  subscribeType<T extends AgentEvent["type"]>(
    type: T,
    handler: (event: Extract<AgentEvent, { type: T }>) => void
  ): () => void;
}

export type AgentEvent =
  | { type: "plan.generated"; plan: ExecutionPlan; timestamp: number }
  | { type: "node.started"; nodeId: string; tool: string; timestamp: number }
  | { type: "node.tool-output"; nodeId: string; chunk: string; timestamp: number }
  | { type: "node.completed"; nodeId: string; result: unknown; timestamp: number }
  | { type: "node.failed"; nodeId: string; error: AgentError; timestamp: number }
  | { type: "node.skipped"; nodeId: string; reason: string; timestamp: number }
  | { type: "permission.requested"; nodeId: string; tool: string; params: unknown; diff?: string; timestamp: number }
  | { type: "permission.granted"; nodeId: string; timestamp: number }
  | { type: "permission.denied"; nodeId: string; reason: string; timestamp: number }
  | { type: "patch.generated"; nodeId: string; file: string; diff: string; timestamp: number }
  | { type: "patch.applied"; nodeId: string; file: string; timestamp: number }
  | { type: "patch.rolledback"; nodeId: string; file: string; timestamp: number }
  | { type: "memory.updated"; working: Partial<WorkingMemory>; timestamp: number }
  | { type: "checkpoint.saved"; taskId: string; nodeId: string; timestamp: number }
  | { type: "task.completed"; summary: string; timestamp: number }
  | { type: "task.failed"; error: AgentError; timestamp: number }
  | { type: "task.cancelled"; reason: string; timestamp: number }
  | { type: "task.paused"; nodeId: string; timestamp: number }
  | { type: "task.resumed"; nodeId: string; timestamp: number };

export interface Checkpoint {
  taskId: string;
  plan: ExecutionPlan;
  completedNodeIds: string[];
  currentNodeId: string | null;
  memory: WorkingMemory;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 11: Memory — 5 Layers
// ═══════════════════════════════════════════════════════════════

export interface AgentMemory {
  working: WorkingMemory;
  task: TaskMemory;
  session: SessionMemory;
  project: ProjectMemory;
  knowledge: KnowledgeMemory;
}

// Layer 1: Working Memory — volatile, per-step focus
export interface WorkingMemory {
  currentHypothesis: string | null;
  currentFile: string | null;
  currentFunction: string | null;
  currentSymbol: string | null;
  currentBug: SemanticIssue | null;
  currentStep: string | null;
  scratchpad: string[];
  pendingChoices: PendingChoice[];
  update(patch: Partial<WorkingMemory>): void;
  pushScratch(note: string): void;
  clear(): void;
}

export interface PendingChoice {
  id: string;
  question: string;
  options: string[];
  selected?: string;
}

// Layer 2: Task Memory — current task state
export interface TaskMemory {
  taskId: string;
  query: string;
  plan: ExecutionPlan | null;
  checkpoints: Checkpoint[];
  executionLog: ExecutionLogEntry[];
  saveCheckpoint(nodeId: string): void;
  loadCheckpoint(): Checkpoint | null;
}

export interface ExecutionLogEntry {
  nodeId: string;
  tool: string;
  params: unknown;
  result: unknown;
  duration: number;
  timestamp: number;
}

// Layer 3: Session Memory — per-session chat
export interface SessionMemory {
  messages: ConversationMessage[];
  locale: "en" | "vi";
  preferences: UserPreferences;
  addMessage(msg: ConversationMessage): void;
  clear(): void;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface UserPreferences {
  autoApproveReadTools: boolean;
  autoApproveWriteTools: boolean;
  maxParallel: number;
  defaultTimeout: number;
}

// Layer 4: Project Memory — cached SPM data
export interface ProjectMemory {
  spm: SemanticProjectModel | null;
  indexes: IndexSystem | null;
  graphCache: Map<string, GraphData>;
  diagramCache: Map<string, unknown>;
  searchCache: Map<string, SearchResult[]>;
  invalidate(): void;
}

// Layer 5: Knowledge Memory — persistent, cross-session
export interface KnowledgeMemory {
  patterns: LearnedPattern[];
  pastFixes: PastFix[];
  userConventions: UserConvention[];
  load(): Promise<void>;
  save(): Promise<void>;
  addPattern(pattern: LearnedPattern): void;
  addFix(fix: PastFix): void;
}

export interface LearnedPattern {
  id: string;
  pattern: string;           // e.g. "N+1 query in loop"
  solution: string;          // known fix approach
  confidence: number;
  occurrenceCount: number;
}

export interface PastFix {
  id: string;
  issue: string;
  approach: string;
  diff: string;
  success: boolean;
  timestamp: string;
}

export interface UserConvention {
  id: string;
  rule: string;              // "always use parameterized queries"
  category: string;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 12: Skill Registry (agents → skills)
// ═══════════════════════════════════════════════════════════════

export interface Skill {
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: Capability[];       // tools this skill can use
  defaultPlanTemplate?: PlanTemplate;
  triggerKeywords: string[];        // for auto-routing
}

export interface PlanTemplate {
  steps: PlanTemplateStep[];
}

export interface PlanTemplateStep {
  capability: Capability;
  description: string;
  dependsOn?: number[];    // step indices
  parallelGroup?: string;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  get(name: string): Skill | null;
  match(query: string): Skill | null;    // auto-route based on keywords
  list(): Skill[];
}

// ═══════════════════════════════════════════════════════════════
// SECTION 13: Permission Gate
// ═══════════════════════════════════════════════════════════════

export interface PermissionGate {
  check(tool: string, params: unknown): PermissionLevel;
  request(tool: string, params: unknown, diff?: string): Promise<boolean>;
  // UI subscribes to "permission.requested" event and calls respond()
  respond(nodeId: string, granted: boolean, reason?: string): void;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 14: Dependency Rules (layer can only depend on lower layers)
// ═══════════════════════════════════════════════════════════════

// Layer 0 (bottom): Semantic Project Model (data only, no deps)
// Layer 1: Index System (depends on SPM types only)
// Layer 2: Semantic Query Service (depends on SPM + Indexes)
// Layer 3: Service Layer (depends on Query Service + existing engines)
// Layer 4: Tool Registry + Capability Registry (depends on Services)
// Layer 5: Context Builder + Token Budget (depends on Tools + Query Service)
// Layer 6: Planner (depends on Tools, Capabilities, Context Builder)
// Layer 7: Agent Runtime + Memory + Permission Gate (depends on all above)
// Layer 8: Skill Registry (depends on Tools, Capabilities)
// Layer 9: UI (depends on Runtime + EventBus)

// VIOLATION example (should NOT happen):
//   SPM importing from Service Layer → circular dependency
//   Tool importing from Planner → layer inversion

// ═══════════════════════════════════════════════════════════════
// SECTION 15: Folder Structure
// ═══════════════════════════════════════════════════════════════

// src/lib/agent/
// ├── contracts/           ← THIS FILE (interfaces only, no implementation)
// │   └── index.ts
// ├── spm/                 ← Layer 0: Semantic Project Model
// │   ├── types.ts
// │   ├── builder.ts
// │   └── index.ts
// ├── indexes/             ← Layer 1: Index System
// │   ├── symbol-index.ts
// │   ├── reference-index.ts
// │   ├── call-index.ts
// │   ├── import-index.ts
// │   ├── issue-index.ts
// │   ├── path-index.ts
// │   └── index.ts
// ├── query/               ← Layer 2: Semantic Query Service
// │   ├── query-service.ts
// │   └── index.ts
// ├── services/            ← Layer 3: Service Layer
// │   ├── graph-service.ts
// │   ├── diagram-service.ts
// │   ├── search-service.ts
// │   ├── git-service.ts
// │   ├── repo-service.ts
// │   ├── ai-insight-service.ts
// │   └── index.ts
// ├── tools/               ← Layer 4: Tool Registry + Capability Registry
// │   ├── tool-registry.ts
// │   ├── capability-registry.ts
// │   ├── manifest.ts
// │   ├── definitions/     ← individual tool implementations
// │   │   ├── search-code.ts
// │   │   ├── find-symbol.ts
// │   │   ├── find-call-chain.ts
// │   │   ├── generate-patch.ts
// │   │   ├── apply-patch.ts
// │   │   ├── git-commit.ts
// │   │   └── ...
// │   └── index.ts
// ├── context/             ← Layer 5: Context Builder + Token Budget
// │   ├── context-builder.ts
// │   ├── token-budget.ts
// │   └── index.ts
// ├── planner/             ← Layer 6: Planner
// │   ├── planner.ts
// │   ├── execution-graph.ts
// │   ├── execution-policy.ts
// │   └── index.ts
// ├── runtime/             ← Layer 7: Runtime + Memory + Permission
// │   ├── runtime.ts
// │   ├── event-bus.ts
// │   ├── permission-gate.ts
// │   ├── checkpoint-manager.ts
// │   ├── rollback-manager.ts
// │   └── index.ts
// ├── memory/              ← Layer 7: Memory (5 layers)
// │   ├── working-memory.ts
// │   ├── task-memory.ts
// │   ├── session-memory.ts
// │   ├── project-memory.ts
// │   ├── knowledge-memory.ts
// │   ├── agent-memory.ts   ← facade combining all 5
// │   └── index.ts
// ├── skills/              ← Layer 8: Skill Registry
// │   ├── skill-registry.ts
// │   ├── definitions/      ← individual skills
// │   │   ├── bug-fix.ts
// │   │   ├── security-audit.ts
// │   │   ├── refactor.ts
// │   │   ├── test-gen.ts
// │   │   ├── docs.ts
// │   │   └── ...
// │   └── index.ts
// └── index.ts             ← public API

// ═══════════════════════════════════════════════════════════════
// SECTION 16: Error Codes (canonical list)
// ═══════════════════════════════════════════════════════════════

export const ERROR_CODES = {
  // Tool errors
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  TOOL_TIMEOUT: "TOOL_TIMEOUT",
  TOOL_EXECUTION_FAILED: "TOOL_EXECUTION_FAILED",
  TOOL_INVALID_PARAMS: "TOOL_INVALID_PARAMS",

  // Permission errors
  PERMISSION_DENIED: "PERMISSION_DENIED",
  PERMISSION_TIMEOUT: "PERMISSION_TIMEOUT",

  // SPM errors
  SPM_NOT_INITIALIZED: "SPM_NOT_INITIALIZED",
  SPM_STALE: "SPM_STALE",

  // Query errors
  SYMBOL_NOT_FOUND: "SYMBOL_NOT_FOUND",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",

  // Planner errors
  PLAN_GENERATION_FAILED: "PLAN_GENERATION_FAILED",
  PLAN_INVALID: "PLAN_INVALID",

  // Runtime errors
  RUNTIME_CANCELLED: "RUNTIME_CANCELLED",
  RUNTIME_PAUSED: "RUNTIME_PAUSED",
  RUNTIME_CHECKPOINT_FAILED: "RUNTIME_CHECKPOINT_FAILED",
  RUNTIME_ROLLBACK_FAILED: "RUNTIME_ROLLBACK_FAILED",

  // Token budget errors
  TOKEN_BUDGET_EXCEEDED: "TOKEN_BUDGET_EXCEEDED",

  // Memory errors
  MEMORY_LOAD_FAILED: "MEMORY_LOAD_FAILED",
  MEMORY_SAVE_FAILED: "MEMORY_SAVE_FAILED",
} as const;

// ═══════════════════════════════════════════════════════════════
// SECTION 17: Event Naming Convention
// ═══════════════════════════════════════════════════════════════

// Format: "{scope}.{action}" (kebab-case)
// Scope: plan, node, permission, patch, memory, checkpoint, task
// Action: past tense (generated, started, completed, failed, etc.)

// All events include: { type, timestamp }
// Node events include: { nodeId }
// Tool events include: { nodeId, tool }

// ═══════════════════════════════════════════════════════════════
// SECTION 18: Logging Convention
// ═══════════════════════════════════════════════════════════════

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  module: string;          // "planner", "runtime", "tool:find-symbol"
  message: string;
  data?: unknown;
  timestamp: number;
  taskId?: string;
  nodeId?: string;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 19: Metrics Convention
// ═══════════════════════════════════════════════════════════════

export interface MetricEntry {
  name: string;            // "tool.execution_time", "plan.node_count"
  value: number;
  unit: string;            // "ms", "count", "tokens"
  tags?: Record<string, string>;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 20: Plugin Convention
// ═══════════════════════════════════════════════════════════════

export interface AgentPlugin {
  name: string;
  version: string;

  // Register tools
  registerTools?(registry: ToolRegistry): void;

  // Register skills
  registerSkills?(registry: SkillRegistry): void;

  // Register capabilities
  registerCapabilities?(registry: CapabilityRegistry): void;

  // Hook into runtime lifecycle
  onPlanGenerated?(plan: ExecutionPlan): void;
  onNodeStarted?(nodeId: string): void;
  onNodeCompleted?(nodeId: string, result: unknown): void;
  onTaskCompleted?(summary: string): void;
}
