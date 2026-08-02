# CodeInsight AI — Implementation Master Plan (IMP)
**Version:** 1.0.0
**Status:** Awaiting approval. No implementation until user says "Bắt đầu Phase 1".
**Prerequisite:** Master Architecture Document (MAD v1.0.0) — FROZEN.

> This is a **project management document**, not an architecture document.
> It defines WHAT to build, in WHAT ORDER, with WHAT criteria.
> Architecture decisions are in `ARCHITECTURE.md`. This document operationalizes them.

---

## 1. Executive Summary

### Mục tiêu cuối cùng
Xây dựng **Coding Agent** cho CodeInsight AI — cạnh tranh với Cursor, Claude Code, OpenCode — tận dụng tối đa codebase hiện có (250 static rules, Graph Engine, Diagram Engine, 10 agents, Repo Editor, Git Intelligence, Terminal, Permission System).

### Phạm vi (In Scope)
- Semantic Project Model (SSOT) — pure data layer
- 6 Indexes (O(1) lookups)
- Semantic Query Service
- 6 Services (wrap existing engines)
- Tool Registry + Capability Registry + 20+ Tools
- Context Builder + Token Budget Manager
- Planner (DAG + Execution Policy)
- Agent Runtime (Event-Driven + Event Bus)
- 4-layer Memory (Working, Task, Session, Project)
- Skill Registry (convert 10 existing agents → Skills)
- Streaming UI (Agent Chat view with DAG visualization, permission dialogs, diff preview)

### Phạm vi (Out of Scope — Future)
- Knowledge Memory (persistent cross-session learning)
- Multi-Agent coordination
- MCP (Model Context Protocol) integration
- Browser/Terminal/Voice agents
- Cloud sync
- Workflow Engine

### Tiêu chí hoàn thành (MVP)
1. User submits natural-language query → Planner generates DAG
2. Runtime executes DAG with streaming events
3. Permission gate prompts before write operations
4. Diff preview shown before patch applied
5. All 10 existing agent capabilities available as Skills
6. Backward compatible — existing features unchanged

---

## 2. Current Status

| Item | Status | Notes |
|------|--------|-------|
| **Architecture (MAD)** | ✅ FROZEN v1.0.0 | `ARCHITECTURE.md` — 19 sections, 1171 lines |
| **Contracts (Phase 0)** | ✅ FROZEN | `src/lib/agent/contracts/index.ts` — 20 sections, 933 lines |
| **Codebase Audit** | ✅ Complete | AUDIT-1 worklog — 90+ files inventoried |
| **Phase 0: Architecture Validation** | ✅ DONE | Contracts, dependency rules, folder structure, error codes, event naming, logging, metrics, plugin convention |
| **Phase 1: SPM** | ⏳ Not started | Awaiting approval |
| **Phase 2: Indexes** | ⏳ Not started | Depends on Phase 1 |
| **Phase 3: Query Service** | ⏳ Not started | Depends on Phase 2 |
| **Phase 4: Services** | ⏳ Not started | Depends on Phase 3 |
| **Phase 5: Tools + Capabilities** | ⏳ Not started | Depends on Phase 4 |
| **Phase 6: Context Builder** | ⏳ Not started | Depends on Phase 3, 5 |
| **Phase 7: Planner** | ⏳ Not started | Depends on Phase 5, 6 |
| **Phase 8: Runtime** | ⏳ Not started | Depends on Phase 5, 7 |
| **Phase 9: Memory** | ⏳ Not started | Depends on Phase 8 |
| **Phase 10: Skills** | ⏳ Not started | Depends on Phase 5, 8 |
| **Phase 11: UI** | ⏳ Not started | Depends on Phase 8, 10 |
| **Phase 12: Multi-Agent** | 🔮 Future | After MVP stable |

---

## 3. Dependency Graph

```
Phase 0 (DONE)
    │
    ▼
Phase 1: SPM
    │
    ▼
Phase 2: Indexes
    │
    ▼
Phase 3: Query Service
    │
    ├──────────────────┐
    ▼                  ▼
Phase 4: Services    Phase 6: Context Builder (needs Query + Tools)
    │                  │
    ▼                  │
Phase 5: Tools         │
    │                  │
    ├──────────────────┘
    │
    ▼
Phase 7: Planner
    │
    ▼
Phase 8: Runtime
    │
    ├──────────┐
    ▼          ▼
Phase 9:     Phase 10: Skills
Memory       │
    │        │
    └────────┤
             │
             ▼
       Phase 11: UI
             │
             ▼
       Phase 12: Future
```

### Parallel opportunities
| Can run in parallel | Condition |
|---------------------|-----------|
| Phase 4 (Services) + Phase 6 (Context Builder) | Phase 3 done. Phase 6 needs Phase 3 + Phase 5. Start Phase 4 first, then Phase 5, then Phase 6 can overlap with Phase 7 prep. |
| Phase 9 (Memory) + Phase 10 (Skills) | Phase 8 done. Both depend on Runtime but don't depend on each other. |
| Phase 11 UI sub-components | Once Phase 8 done, DAG visualizer + streaming output can be built while Phase 10 finishes. |

### Critical path (longest chain)
```
Phase 1 → 2 → 3 → 4 → 5 → 7 → 8 → 11
```
**8 phases on critical path.** Total estimated: 27 days (critical path only).

---

## 4. Phase Details

### Phase 0: Architecture Validation & Contracts

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ COMPLETED |
| **Mục tiêu** | Đóng băng toàn bộ interfaces, dependency rules, folder structure, conventions |
| **Lý do tồn tại** | Tránh refactor khi scale. "Frozen contracts" cho phép implement mà không suy đoán. |
| **Kiến trúc liên quan** | All layers (contracts span 20 sections) |
| **Module liên quan** | `src/lib/agent/contracts/` |
| **Files đã tạo** | `src/lib/agent/contracts/index.ts` (933 lines), `ARCHITECTURE.md` (1171 lines) |
| **Files đã sửa** | None |
| **Public APIs** | All interfaces exported from `@/lib/agent/contracts` |
| **Internal APIs** | N/A (interfaces only) |
| **Dependencies** | None |
| **Risks** | None (completed) |
| **Backward Compatibility** | 100% — no existing code touched |
| **Migration Strategy** | N/A |
| **Verification** | TypeScript compiles. ESLint passes. |
| **Testing Strategy** | Contract tests (type-level only — no runtime tests needed) |
| **Exit Criteria** | ✅ Met. All 20 sections defined. Compiles. Lint passes. |
| **Deliverables** | `contracts/index.ts`, `ARCHITECTURE.md` |
| **Estimated Complexity** | Low (interfaces only) |
| **Estimated Time** | 1 day (actual) |
| **Priority** | P0 (blocker) |

---

### Phase 1: Semantic Project Model (Layer 0)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Build SPM from existing `AnalysisReport`. SPM is pure data — no methods, no logic. |
| **Lý do tồn tại** | Hiện tại 4+ modules (Graph Engine, Diagram Engine, Code Explorer, Agents) mỗi cái tự parse `AnalysisReport`. SPM là SSOT — tất cả đọc từ 1 nguồn. |
| **Kiến trúc liên quan** | Layer 0 (bottom — pure data) |
| **Module liên quan** | `src/lib/agent/spm/` |
| **Files dự kiến tạo** | `src/lib/agent/spm/types.ts` (re-export from contracts), `src/lib/agent/spm/builder.ts`, `src/lib/agent/spm/serializer.ts`, `src/lib/agent/spm/index.ts` |
| **Files dự kiến sửa** | None (existing code untouched) |
| **Public APIs** | `buildSPM(report: AnalysisReport): Result<SemanticProjectModel>`, `serializeSPM(spm): string`, `deserializeSPM(json): Result<SemanticProjectModel>` |
| **Internal APIs** | `mapFiles(report)`, `mapSymbols(report)`, `mapEdges(report)`, `mapIssues(report)`, `mapInsights(report)`, `mapArchitecture(report)`, `mapMetrics(report)` |
| **Dependencies** | Phase 0 (contracts), `src/lib/types.ts` (AnalysisReport type) |
| **Risks** | R1: SPM schema mismatch với Graph/Diagram engines (mitigation: engines continue reading from report, SPM is parallel). R2: Large repos (>500 files) → SPM too large in memory (mitigation: lazy-load file content, only load on demand). |
| **Backward Compatibility** | 100% — SPM is additive, no existing code changes |
| **Migration Strategy** | SPM builder reads from AnalysisReport (existing). Later phases migrate consumers one-by-one. |
| **Verification** | Build SPM from sample report → verify file/symbol/edge/issue counts match report |
| **Testing Strategy** | Unit: `buildSPM(sampleReport)` → assert counts. Edge cases: empty report, report with 0 issues, report with 100+ files. |
| **Exit Criteria** | SPM builds from any existing AnalysisReport. All data mapped. Unit tests pass. |
| **Deliverables** | `spm/builder.ts`, `spm/serializer.ts`, `spm/types.ts`, `spm/index.ts` |
| **Estimated Complexity** | Medium (mapping logic, but no algorithms) |
| **Estimated Time** | 4 days |
| **Priority** | P0 (blocks all subsequent phases) |

---

### Phase 2: Index System (Layer 1)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | 6 indexes for O(1) lookups on SPM data |
| **Lý do tồn tại** | Agent sẽ gọi `findSymbol("handleLogin")` rất nhiều lần. O(1) lookup thay vì O(n) scan mỗi lần. |
| **Kiến trúc liên quan** | Layer 1 |
| **Module liên quan** | `src/lib/agent/indexes/` |
| **Files dự kiến tạo** | `symbol-index.ts`, `reference-index.ts`, `call-index.ts`, `import-index.ts`, `issue-index.ts`, `path-index.ts`, `index-builder.ts`, `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `buildIndexes(spm): IndexSystem` |
| **Internal APIs** | Each index: `byName()`, `byId()`, `byFile()`, etc. |
| **Dependencies** | Phase 1 (SPM) |
| **Risks** | R1: Index build performance on 500-file repo (mitigation: O(n) build, benchmark, target <100ms). R2: Path index (BFS/Tarjan) can be slow on dense graphs (mitigation: cache results, lazy compute). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Indexes build from SPM. Existing Graph Engine continues using its own internal index. Later: Graph Engine can optionally use SPM indexes. |
| **Verification** | Build indexes from sample SPM → verify O(1) lookups return correct results |
| **Testing Strategy** | Unit: each index method returns expected results. Performance: 500-file repo, build <100ms, lookup <1ms. |
| **Exit Criteria** | All 6 indexes build from SPM. O(1) lookups verified. Performance target met. |
| **Deliverables** | 6 index files + builder + barrel |
| **Estimated Complexity** | Medium (6 separate indexes, each with Map-based lookup) |
| **Estimated Time** | 3 days |
| **Priority** | P0 (blocks Phase 3) |

---

### Phase 3: Semantic Query Service (Layer 2)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Business logic queries on top of SPM + Indexes. 15 methods. |
| **Lý do tồn tại** | Services và Tools không trực tiếp đọc SPM/Indexes. Query Service là abstraction layer — dễ test, cache, swap implementation. |
| **Kiến trúc liên quan** | Layer 2 |
| **Module liên quan** | `src/lib/agent/query/` |
| **Files dự kiến tạo** | `query-service.ts`, `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `createQueryService(spm, indexes): SemanticQueryService` |
| **Internal APIs** | 15 query methods: `findSymbol`, `findDefinition`, `findReferences`, `findCallers`, `findCallees`, `findCallChain`, `findImpact`, `searchCode`, `findFile`, `findDeadCode`, `findDuplicates`, `findIssues`, `findIssuesByFile`, `findIssuesBySymbol`, `getArchitecture`, `getMetrics`, `findCircularDependencies`, `getDiagram` |
| **Dependencies** | Phase 1 (SPM), Phase 2 (Indexes) |
| **Risks** | Low — straightforward composition of indexes |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Query Service reads from SPM + Indexes. Existing code unchanged. |
| **Verification** | Each query method returns expected results for sample SPM |
| **Testing Strategy** | Unit: each of 15 methods. Integration: query → verify against known data. |
| **Exit Criteria** | 15 methods implemented, all return `Result<T>`, unit tests pass |
| **Deliverables** | `query-service.ts`, `index.ts` |
| **Estimated Complexity** | Low-Medium (composition of indexes, Result wrapping) |
| **Estimated Time** | 2 days |
| **Priority** | P0 (blocks Phase 4, 6) |

---

### Phase 4: Service Layer (Layer 3)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Wrap existing engines (Graph, Diagram, Search, Git, Repo, AI) in service classes |
| **Lý do tồn tại** | Tools không gọi engines trực tiếp. Services là abstraction — dễ mock, cache, log. Nếu sau này đổi Graph Engine implementation, chỉ sửa Service, không sửa Tools. |
| **Kiến trúc liên quan** | Layer 3 |
| **Module liên quan** | `src/lib/agent/services/` |
| **Files dự kiến tạo** | `graph-service.ts`, `diagram-service.ts`, `search-service.ts`, `git-service.ts`, `repo-service.ts`, `ai-insight-service.ts`, `index.ts` |
| **Files dự kiến sửa** | None (existing engines untouched — Services wrap them) |
| **Public APIs** | `GraphService`, `DiagramService`, `SearchService`, `GitService`, `RepoService`, `AIInsightService` |
| **Internal APIs** | Each service: methods matching existing engine capabilities |
| **Dependencies** | Phase 3 (Query Service), existing engines (`src/lib/graph/*`, `src/lib/diagram/*`, `src/lib/repo-editor/*`, `src/lib/git-intelligence/*`, `src/lib/terminal/*`, `src/lib/ai-client.ts`) |
| **Risks** | R1: Existing engines expect `AnalysisReport`, not SPM (mitigation: Services accept SPM, convert to report internally for engine calls. Later: engines read from SPM directly). R2: Git/Terminal services have side effects (mitigation: permission checks at Service level). |
| **Backward Compatibility** | 100% — existing engines unchanged |
| **Migration Strategy** | Services wrap existing engines. No engine modifications. Later: engines can be refactored to read from SPM (optional, not required for MVP). |
| **Verification** | `GraphService.buildGraph(spm)` produces same `GraphData` as existing graph engine |
| **Testing Strategy** | Integration: each Service wraps engine correctly. Mock: Service with mock engine. |
| **Exit Criteria** | 6 services implemented, all wrap existing engines without modification |
| **Deliverables** | 6 service files + barrel |
| **Estimated Complexity** | Medium (adapter pattern, but 6 services) |
| **Estimated Time** | 3 days |
| **Priority** | P0 (blocks Phase 5) |

---

### Phase 5: Tool Registry + Capability Registry (Layer 4)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Register 20+ tools with manifests. Map capabilities to tools (1:1 initially). |
| **Lý do tồn tại** | AI gọi tools qua tên, không gọi engines trực tiếp. Tool Manifest cho Planner biết cost/timeout/confidence. Capability Registry tách Planner khỏi Tool implementation. |
| **Kiến trúc liên quan** | Layer 4 |
| **Module liên quan** | `src/lib/agent/tools/` |
| **Files dự kiến tạo** | `tool-registry.ts`, `capability-registry.ts`, `manifest.ts` (re-export), `definitions/` (20 tool files), `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `ToolRegistry.register(tool)`, `ToolRegistry.get(name)`, `ToolRegistry.listByCapability(cap)`, `CapabilityRegistry.resolve(cap): string` |
| **Internal APIs** | Each tool: `execute(params, context): Promise<Result<unknown>>` |
| **Dependencies** | Phase 4 (Services) |
| **Risks** | R1: Tool manifest schema too rigid (mitigation: start minimal, extend as needed). R2: Tool execution errors not handled uniformly (mitigation: all tools return `Result<T>`, Runtime handles errors). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Tools are new. Existing agents continue using engines directly. Later: agents become Skills that use Tools. |
| **Verification** | Execute each tool with sample params, verify result |
| **Testing Strategy** | Unit: each tool. Integration: tool → service → engine → verify result. |
| **Exit Criteria** | 20 tools registered with manifests. `CapabilityRegistry.resolve("find-symbol")` returns tool. All tools executable. |
| **Deliverables** | Registry + 20 tool definitions + barrel |
| **Estimated Complexity** | Medium-High (20 tool implementations, but each is thin wrapper) |
| **Estimated Time** | 3 days |
| **Priority** | P0 (blocks Phase 6, 7, 10) |

---

### Phase 6: Context Builder + Token Budget (Layer 5)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Assemble LLM context within token budget. Rank, compress, deduplicate. |
| **Lý do tồn tại** | Nếu không có budget, Agent gửi full context → overflow 128K limit. Cursor/Claude Code đều có token budget manager. |
| **Kiến trúc liên quan** | Layer 5 |
| **Module liên quan** | `src/lib/agent/context/` |
| **Files dự kiến tạo** | `context-builder.ts`, `token-budget.ts`, `context-ranker.ts`, `context-compressor.ts`, `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `ContextBuilder.build(needs, budget, context): Result<AgentContextPayload>` |
| **Internal APIs** | `TokenBudgetManager.estimate(content): number`, `allocate(needs, budget): TokenAllocation[]`, `ContextRanker.rank(needs): TokenAllocation[]`, `ContextCompressor.compress(allocations, target): TokenAllocation[]` |
| **Dependencies** | Phase 3 (Query Service), Phase 5 (Tools — for tool results) |
| **Risks** | R1: Token estimation inaccurate (mitigation: conservative 4 chars/token, calibrate later). R2: Compression drops important context (mitigation: never drop "critical" priority, only "nice-to-have"). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Context Builder is new. Existing agents send full context. Later: Skills use Context Builder. |
| **Verification** | 200K tokens of input → trimmed to 120K, critical content preserved |
| **Testing Strategy** | Unit: estimate, allocate, rank, compress. Integration: build context from 4+ tool results. |
| **Exit Criteria** | Context builder assembles context from multiple tool results, fits within budget, trims low-priority on overflow |
| **Deliverables** | 4 files + barrel |
| **Estimated Complexity** | Medium (token estimation + priority ranking + compression logic) |
| **Estimated Time** | 3 days |
| **Priority** | P1 (blocks Phase 7) |

---

### Phase 7: Planner (Layer 6)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | LLM generates ExecutionPlan (DAG + Policy) from user query |
| **Lý do tồn tại** | Thay vì user chọn agent manually, Planner tự sinh kế hoạch. DAG cho phép parallel execution. |
| **Kiến trúc liên quan** | Layer 6 |
| **Module liên quan** | `src/lib/agent/planner/` |
| **Files dự kiến tạo** | `planner.ts`, `execution-graph.ts`, `execution-policy.ts`, `plan-validator.ts`, `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `Planner.plan(query, context): Promise<Result<ExecutionPlan>>` |
| **Internal APIs** | `buildDAG(llmResponse): ExecutionGraph`, `validateDAG(graph): Result<void>`, `defaultPolicy(): ExecutionPolicy` |
| **Dependencies** | Phase 5 (Tools — for capability list), Phase 6 (Context Builder — for planner context) |
| **Risks** | R1: LLM generates invalid DAG (cycles, missing deps) (mitigation: PlanValidator + retry with error feedback, max 2 retries). R2: LLM hallucinates capabilities that don't exist (mitigation: validate against CapabilityRegistry). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Planner is new. Existing agents run without Planner. Later: Skills use Planner. |
| **Verification** | Planner generates valid DAG for 5 sample queries |
| **Testing Strategy** | Unit: validateDAG (cycle detection, dep existence). Integration: LLM generates plan for sample query → validate. |
| **Exit Criteria** | 5 sample queries produce valid DAGs. Validator catches invalid plans. |
| **Deliverables** | 4 files + barrel |
| **Estimated Complexity** | High (LLM prompt engineering + DAG validation + retry logic) |
| **Estimated Time** | 4 days |
| **Priority** | P0 (blocks Phase 8) |

---

### Phase 8: Agent Runtime (Layer 7)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Event-driven DAG executor with pause/resume/cancel/rollback |
| **Lý do tồn tại** | Runtime là "trái tim" — điều phối toàn bộ execution. Không Runtime = không Agent. |
| **Kiến trúc liên quan** | Layer 7 |
| **Module liên quan** | `src/lib/agent/runtime/` |
| **Files dự kiến tạo** | `runtime.ts`, `event-bus.ts`, `permission-gate.ts`, `checkpoint-manager.ts`, `rollback-manager.ts`, `execution-engine.ts`, `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `AgentRuntime.run(plan, context): AsyncGenerator<AgentEvent>`, `cancel(taskId)`, `pause(taskId)`, `resume(taskId)` |
| **Internal APIs** | `ExecutionEngine.executeNode(node)`, `EventBus.emit(event)`, `PermissionGate.request(tool, params)`, `CheckpointManager.save(nodeId)`, `RollbackManager.track(change)` |
| **Dependencies** | Phase 5 (Tools), Phase 7 (Planner — for ExecutionPlan type) |
| **Risks** | R1: Concurrent execution bugs (mitigation: start with maxParallel=1, increase to 3 after testing). R2: Checkpoint serialization too large (mitigation: compress, cap at 50 recent). R3: Rollback incomplete (mitigation: track all file changes in ChangeRecord, test rollback on real files). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Runtime is new. Existing `/api/agents/execute` continues working. Later: new `/api/agent/run` uses Runtime. |
| **Verification** | Execute 5-node DAG → verify all events emitted in correct order |
| **Testing Strategy** | Unit: EventBus, PermissionGate. Integration: execute DAG end-to-end. E2E: cancel mid-execution, resume from checkpoint. |
| **Exit Criteria** | Runtime executes DAG, emits events, handles permission requests, supports cancel + resume |
| **Deliverables** | 6 files + barrel |
| **Estimated Complexity** | Very High (concurrent execution, event system, state management, rollback) |
| **Estimated Time** | 4 days |
| **Priority** | P0 (blocks Phase 9, 10, 11) |

---

### Phase 9: Memory (Layer 7)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | 4-layer memory: Working, Task, Session, Project |
| **Lý do tồn tại** | Agent cần nhớ: đang focus file nào (Working), task state (Task), chat history (Session), cached SPM (Project). Không memory = mỗi lần gọi agent bắt đầu từ scratch. |
| **Kiến trúc liên quan** | Layer 7 |
| **Module liên quan** | `src/lib/agent/memory/` |
| **Files dự kiến tạo** | `working-memory.ts`, `task-memory.ts`, `session-memory.ts`, `project-memory.ts`, `agent-memory.ts` (facade), `index.ts` |
| **Files dự kiến sửa** | None |
| **Public APIs** | `AgentMemory.working`, `.task`, `.session`, `.project` |
| **Internal APIs** | `WorkingMemory.update(patch)`, `TaskMemory.saveCheckpoint(nodeId)`, `SessionMemory.addMessage(msg)`, `ProjectMemory.invalidate()` |
| **Dependencies** | Phase 8 (Runtime — for event subscription) |
| **Risks** | R1: sessionStorage quota exceeded (mitigation: compress checkpoints, cap at 50). R2: Working Memory stale after task switch (mitigation: clear Working Memory between unrelated tasks). |
| **Backward Compatibility** | 100% — additive |
| **Migration Strategy** | Memory is new. Existing chat uses Zustand store. Later: Session Memory replaces Zustand chat store (optional). |
| **Verification** | Pause task → resume → verify state restored from Task Memory |
| **Testing Strategy** | Unit: each memory layer. Integration: run task → pause → resume → verify. |
| **Exit Criteria** | 4 memory layers working. Working Memory updates on events. Checkpoints save/load. |
| **Deliverables** | 5 files + barrel |
| **Estimated Complexity** | Medium (4 layers, but each is simple key-value store) |
| **Estimated Time** | 3 days |
| **Priority** | P1 (can overlap with Phase 10) |

---

### Phase 10: Skill Registry (Layer 8)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Convert 10 existing agents to Skills. Auto-route by keywords. |
| **Lý do tồn tại** | 10 Agent classes riêng = duplicate logic (each calls AI, builds context). Skills = systemPrompt + capabilities + triggerKeywords. 1 Runtime + many Skills. |
| **Kiến trúc liên quan** | Layer 8 |
| **Module liên quan** | `src/lib/agent/skills/` |
| **Files dự kiến tạo** | `skill-registry.ts`, `skill-types.ts`, `definitions/` (10 skill files), `index.ts` |
| **Files dự kiến sửa** | Existing agent files (`src/lib/agents/*.ts`) — NOT deleted, but wrapped by Skills |
| **Public APIs** | `SkillRegistry.register(skill)`, `SkillRegistry.get(name)`, `SkillRegistry.match(query): Skill` |
| **Internal APIs** | Each skill: `name`, `systemPrompt`, `capabilities`, `triggerKeywords`, `defaultPlanTemplate` |
| **Dependencies** | Phase 5 (Tools — capabilities), Phase 8 (Runtime — for execution) |
| **Risks** | R1: Existing agents have complex logic that doesn't fit Skill template (mitigation: Skills wrap existing agent logic, don't rewrite. Skill's `systemPrompt` + `capabilities` configure the agent). R2: Keyword matching too broad/narrow (mitigation: test with 50+ queries, tune keywords). |
| **Backward Compatibility** | 100% — existing agents remain functional. Skills are a new layer on top. |
| **Migration Strategy** | Skills import existing agent classes. `SkillRegistry.match("fix bug")` → returns "bug-fix" skill → skill configures Runtime to use BugFixerAgent logic. Later: agent logic moves into Skills (optional refactor). |
| **Verification** | `match("fix bug login")` returns "bug-fix" skill. `match("add test for login")` returns "test-gen" skill. |
| **Testing Strategy** | Unit: keyword matching for all 10 skills. Integration: skill → Runtime → execute → verify. |
| **Exit Criteria** | 10 skills registered. Keyword matching works for 50+ test queries. |
| **Deliverables** | Registry + 10 skill definitions + barrel |
| **Estimated Complexity** | Medium (adapter pattern + keyword tuning) |
| **Estimated Time** | 2 days |
| **Priority** | P1 (can overlap with Phase 9) |

---

### Phase 11: Streaming UI (Layer 9)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | New Agent Chat view with DAG visualization, streaming, permission dialogs, diff preview |
| **Lý do tồn tại** | User cần thấy: plan (DAG), tool calls, progress, permission prompts, diff before/after. Không UI = Agent hoạt động nhưng user không kiểm soát được. |
| **Kiến trúc liên quan** | Layer 9 |
| **Module liên quan** | `src/components/views/agent-chat-view.tsx` + sub-components |
| **Files dự kiến tạo** | `agent-chat-view.tsx`, `plan-visualizer.tsx`, `tool-call-card.tsx`, `permission-dialog.tsx`, `diff-preview.tsx`, `memory-panel.tsx`, `streaming-output.tsx`, `progress-indicator.tsx` |
| **Files dự kiến sửa** | `src/app/page.tsx` (add "agent" view), `src/lib/types.ts` (add "agent" to View union), `src/lib/store.ts` (add agent view state) |
| **Public APIs** | `<AgentChatView />` component |
| **Internal APIs** | Subscribes to EventBus, renders events |
| **Dependencies** | Phase 8 (Runtime + EventBus), Phase 10 (Skills — for auto-routing) |
| **Risks** | R1: SSE streaming on Vercel serverless 10s limit (mitigation: use chunked HTTP response or Edge Runtime, not true SSE). R2: DAG visualization complex (mitigation: start with simple list, add graph viz later). R3: Diff preview rendering performance (mitigation: virtualized list for large diffs). |
| **Backward Compatibility** | Existing `chat-view.tsx` remains. `agent-chat-view.tsx` is new. User can switch between them. Later: agent-chat replaces chat-view. |
| **Migration Strategy** | New "agent" view added alongside existing "chat" view. No existing UI broken. |
| **Verification** | User submits query → sees DAG → approves patch → sees result. E2E. |
| **Testing Strategy** | E2E: full flow (query → plan → execute → approve → result). Visual: screenshot comparison. A11y: keyboard navigation, ARIA labels. |
| **Exit Criteria** | Full user flow works: query → plan → execute → permission → apply → result |
| **Deliverables** | 8 UI component files |
| **Estimated Complexity** | High (streaming, real-time updates, diff rendering, permission UX) |
| **Estimated Time** | 4 days |
| **Priority** | P0 (MVP requirement) |

---

### Phase 12: Multi-Agent + Knowledge Memory (Future)

| Attribute | Value |
|-----------|-------|
| **Mục tiêu** | Agent Manager coordinates multiple Skills. Knowledge Memory persists learned patterns. |
| **Lý do tồn tại** | "Fix bug → test → commit → push" cần nhiều Skills phối hợp. Knowledge Memory giúp Agent học từ past fixes. |
| **Kiến trúc liên quan** | Layer 7+ (extends Runtime + Memory) |
| **Module liên quan** | `src/lib/agent/orchestrator/`, `src/lib/agent/memory/knowledge-memory.ts` |
| **Files dự kiến tạo** | TBD |
| **Files dự kiến sửa** | TBD |
| **Dependencies** | All Phase 1-11 complete |
| **Risks** | Scope creep. Defer until single-agent is stable. |
| **Backward Compatibility** | N/A (future) |
| **Migration Strategy** | N/A |
| **Verification** | TBD |
| **Testing Strategy** | TBD |
| **Exit Criteria** | TBD |
| **Deliverables** | TBD |
| **Estimated Complexity** | Very High |
| **Estimated Time** | Future (not estimated) |
| **Priority** | P2 (future) |

---

## 5. Milestones

| Milestone | Phases | Goal | Est. Time |
|-----------|--------|------|-----------|
| **M1: Foundation** | Phase 1, 2, 3 | SPM + Indexes + Query Service. Agent có thể query project data. | 9 days |
| **M2: Integration** | Phase 4, 5 | Services + Tools. Agent có thể gọi tools để query + modify. | 6 days |
| **M3: Intelligence** | Phase 6, 7 | Context Builder + Planner. Agent tự sinh kế hoạch. | 7 days |
| **M4: Execution** | Phase 8, 9 | Runtime + Memory. Agent thực thi kế hoạch, nhớ state. | 7 days |
| **M5: Skills** | Phase 10 | 10 existing agents → Skills. Auto-routing. | 2 days |
| **M6: User Experience** | Phase 11 | Streaming UI. User tương tác đầy đủ. | 4 days |
| **M7: Production Ready** | All above | Full MVP. Deploy. | 35 days total |
| **M8: Future** | Phase 12 | Multi-Agent, Knowledge Memory, MCP, etc. | TBD |

### Critical path
```
M1 (9d) → M2 (6d) → M3 (7d) → M4 (7d) → M6 (4d) = 33 days
```
M5 (Phase 10) can overlap with M4 (Phase 9). M7 includes buffer.

---

## 6. Critical Path Analysis

### Critical path (must be sequential)
```
Phase 1 → 2 → 3 → 4 → 5 → 7 → 8 → 11
```
**8 phases, 27 days.** Any delay here delays the entire project.

### Parallelizable
| Phases | Condition | Time saved |
|--------|-----------|------------|
| Phase 6 (Context) + Phase 7 prep | Phase 5 done, Phase 6 doesn't block Phase 7 start | 2 days |
| Phase 9 (Memory) + Phase 10 (Skills) | Phase 8 done, both independent | 2 days |
| Phase 11 sub-components | Phase 8 done, build DAG visualizer while Phase 10 finishes | 2 days |

### Can be delayed (non-critical)
| Phase | Why |
|-------|-----|
| Phase 9 (Memory) | Agent works without Memory (just stateless). Memory improves UX but not functionality. |
| Phase 10 (Skills) | Agent works with manual skill selection. Auto-routing is convenience. |
| Phase 12 | Future, not MVP. |

### Cannot be delayed (critical)
| Phase | Why |
|-------|-----|
| Phase 1 (SPM) | Everything depends on it |
| Phase 2 (Indexes) | Query Service depends on it |
| Phase 3 (Query Service) | Services + Context Builder depend on it |
| Phase 5 (Tools) | Planner + Runtime depend on it |
| Phase 7 (Planner) | Runtime depends on it |
| Phase 8 (Runtime) | UI depends on it |
| Phase 11 (UI) | MVP requirement |

---

## 7. Risk Analysis

| Phase | Risk | Impact | Probability | Mitigation | Rollback |
|-------|------|--------|-------------|------------|----------|
| 1 | SPM schema mismatch with engines | Medium | Low | Engines continue reading from report; SPM is parallel | Revert SPM builder |
| 1 | Large repo SPM memory | Medium | Medium | Lazy-load file content | Add pagination |
| 2 | Index build slow on 500+ files | Medium | Low | O(n) build, benchmark | Cache indexes |
| 2 | Path index BFS slow on dense graph | Low | Medium | Lazy compute, cache results | Skip path index |
| 3 | Query returns wrong results | High | Low | Unit tests with known data | Fix query logic |
| 4 | Engine expects report not SPM | Medium | High | Service converts SPM→report internally | Keep conversion layer |
| 4 | Git/Terminal side effects | High | Medium | Permission checks at Service level | Dry-run mode |
| 5 | Tool manifest too rigid | Low | Medium | Start minimal, extend | Add optional fields |
| 5 | Tool execution errors | Medium | Medium | All return Result<T>, Runtime handles | Retry/rollback |
| 6 | Token estimation inaccurate | Medium | High | Conservative ratio, calibrate | Adjust ratio |
| 6 | Compression drops important context | High | Low | Never drop "critical" priority | Manual review |
| 7 | LLM generates invalid DAG | High | High | PlanValidator + retry | Fallback to sequential |
| 7 | LLM hallucinates capabilities | Medium | Medium | Validate against CapabilityRegistry | Ask LLM to retry |
| 8 | Concurrent execution bugs | High | Medium | Start maxParallel=1, increase gradually | Force sequential |
| 8 | Checkpoint too large | Low | Medium | Compress, cap 50 recent | Reduce checkpoint frequency |
| 8 | Rollback incomplete | High | Low | Track all changes in ChangeRecord | Manual recovery |
| 9 | sessionStorage quota exceeded | Low | Medium | Compress, cap 50 | Use IndexedDB |
| 9 | Working Memory stale | Medium | Low | Clear between tasks | Auto-clear on task end |
| 10 | Existing agents don't fit Skill template | Medium | Medium | Wrap, don't rewrite | Keep agents as-is |
| 10 | Keyword matching too broad/narrow | Low | High | Test 50+ queries, tune | Manual skill selection |
| 11 | SSE on Vercel 10s limit | High | High | Chunked response or Edge Runtime | Polling fallback |
| 11 | DAG visualization complex | Medium | Medium | Start with list, add graph later | Simple list |
| 11 | Diff preview performance | Low | Medium | Virtualized list | Pagination |

---

## 8. Testing Roadmap

| Phase | Unit Tests | Integration Tests | Regression | Performance | Contract Tests |
|-------|-----------|-------------------|------------|-------------|----------------|
| 1 | `buildSPM` with sample report | SPM → verify counts vs report | Existing analysis still works | Build time <100ms (500 files) | SPM matches contract types |
| 2 | Each index method | Index → lookup → verify result | — | Build <100ms, lookup <1ms | Index interfaces match contracts |
| 3 | Each of 15 query methods | Query → verify against known data | — | — | QueryService interface matches |
| 4 | Each service (mock engine) | Service → engine → verify result | Existing engines unchanged | — | Service interfaces match |
| 5 | Each tool (mock service) | Tool → service → engine → verify | — | Tool execution <timeout | Manifest matches schema |
| 6 | estimate, allocate, rank, compress | Build context from 4+ results | — | Token estimate ±10% accuracy | — |
| 7 | validateDAG (cycle, deps) | LLM → plan → validate | — | Plan generation <30s | Plan matches contract |
| 8 | EventBus, PermissionGate, Checkpoint | Execute 5-node DAG end-to-end | — | 5-node DAG <10s | Events match contract |
| 9 | Each memory layer | Pause → resume → verify state | — | Checkpoint save/load <100ms | Memory interfaces match |
| 10 | Keyword matching (50+ queries) | Skill → Runtime → execute | Existing agents still work | — | Skill interface matches |
| 11 | Component render tests | E2E: query → plan → approve → result | Existing chat-view works | UI render <16ms (60fps) | — |

### Test file locations
```
src/lib/agent/__tests__/
├── spm/builder.test.ts
├── indexes/*.test.ts
├── query/query-service.test.ts
├── services/*.test.ts
├── tools/*.test.ts
├── context/*.test.ts
├── planner/*.test.ts
├── runtime/*.test.ts
├── memory/*.test.ts
└── skills/*.test.ts

src/components/views/__tests__/
└── agent-chat-view.test.tsx
```

---

## 9. Completion Checklist

### M1: Foundation
- ☐ Phase 1: SPM builds from AnalysisReport
- ☐ Phase 2: 6 indexes build from SPM, O(1) lookups
- ☐ Phase 3: 15 query methods return Result<T>

### M2: Integration
- ☐ Phase 4: 6 services wrap existing engines
- ☐ Phase 5: 20 tools registered with manifests

### M3: Intelligence
- ☐ Phase 6: Context builder fits within token budget
- ☐ Phase 7: Planner generates valid DAG for 5 sample queries

### M4: Execution
- ☐ Phase 8: Runtime executes DAG, emits events, handles permissions
- ☐ Phase 9: 4 memory layers working, checkpoint/resume

### M5: Skills
- ☐ Phase 10: 10 skills registered, keyword matching

### M6: User Experience
- ☐ Phase 11: Agent Chat UI — full E2E flow works

### M7: Production Ready
- ☐ All phases complete
- ☐ All tests pass
- ☐ Deploy to Vercel
- ☐ Backward compatibility verified
- ☐ No existing features broken

---

## 10. Readiness Matrix

| Dimension | Ready? | Score | Notes |
|-----------|--------|-------|-------|
| **Architecture Ready** | ✅ | 10/10 | MAD v1.0.0 frozen. 19 sections. 10-layer design. |
| **Contracts Ready** | ✅ | 10/10 | Phase 0 done. 20 sections, 933 lines. TypeScript compiles. |
| **Implementation Ready** | ⏳ | 0/10 | Phase 1-11 not started. Awaiting approval. |
| **Production Ready** | ⏳ | 0/10 | After Phase 11 + deploy |
| **AI Agent Ready** | ⏳ | 2/10 | Architecture ready, implementation pending. 9.5/10 once built. |
| **Plugin Ready** | ✅ | 9/10 | AgentPlugin interface defined. Plugin loader deferred. |
| **Testing Ready** | ✅ | 8/10 | Strategy defined per phase. Test infrastructure (Jest) exists. |
| **Documentation Ready** | ✅ | 9/10 | MAD + IMP + contracts. Code docs pending implementation. |
| **Backward Compatibility** | ✅ | 10/10 | Zero changes to existing code. Agent system is additive. |

---

## 11. Future Roadmap (Post-MVP)

These are NOT part of the current 12-phase plan. They are candidates for future development after MVP is stable.

| Feature | Description | Dependencies |
|---------|-------------|--------------|
| **Knowledge Memory** | Persistent cross-session learning (patterns, past fixes, user conventions) | Phase 9 (Memory) |
| **Multi-Agent Coordination** | Agent Manager routes to multiple Skills, parallel agents | Phase 10 (Skills) |
| **MCP Integration** | Model Context Protocol — standard tool interface for AI models | Phase 5 (Tools) |
| **Browser Agent** | Agent can navigate browser, inspect DOM, run audits | Phase 8 (Runtime) |
| **Terminal Agent** | Agent can run terminal commands interactively | Phase 8 (Runtime), existing Terminal |
| **Voice Agent** | Voice input/output for agent | Phase 11 (UI) |
| **Cloud Sync** | Sync agent state across devices | Phase 9 (Memory) |
| **Workflow Engine** | Visual workflow builder (drag-drop DAG) | Phase 7 (Planner) |
| **Agent Marketplace** | Share/download community Skills | Phase 10 (Skills) |
| **Real-time Collaboration** | Multiple users on same agent session | Phase 8 (Runtime) |
| **Code Search (Semantic)** | Vector embedding-based code search | Phase 3 (Query Service) |
| **Auto-fix CI/CD** | Agent runs in CI, auto-fixes PRs | Phase 8 (Runtime) |

---

## 12. Summary

| Metric | Value |
|--------|-------|
| Total phases | 12 (Phase 0 done + Phase 1-11 + Phase 12 future) |
| MVP phases | 11 (Phase 1-11) |
| Estimated time (MVP) | 35 days (27 critical path + 8 parallel) |
| Architecture score | 9.4/10 |
| Backward compatibility | 100% |
| New files | ~60 files in `src/lib/agent/` + 8 UI components |
| Modified files | 3 (`page.tsx`, `types.ts`, `store.ts` — for "agent" view) |
| Deleted files | 0 |
| New packages | 0 (Phase 11 may add DAG viz library) |
| New API routes | 1 (`/api/agent/run` — Phase 11) |
| New DB models | 0 (existing 18 suffice) |
| New env vars | 0 |

---

## Approval Gate

**This Implementation Master Plan is FROZEN.**

No implementation begins until the user explicitly says:
> "Bắt đầu Phase 1"

or

> "Approved — begin implementation"

Once approved, phases proceed sequentially following the dependency graph. Each phase must meet its Exit Criteria before the next phase begins.

**Changes to this document after approval require a version bump** (1.0.0 → 1.1.0 for minor adjustments, 2.0.0 for major restructuring).
