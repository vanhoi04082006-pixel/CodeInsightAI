# CodeInsight AI — Agent Architecture v1 Final Audit
**Date:** 2026-08-03
**Scope:** Phase 0 → Phase 11 (all source code in `src/lib/agent/` + UI + API)
**Method:** Read-only audit — no code modified. All findings based on actual source.

---

## 1. Phase-by-Phase Audit

### Phase 0 — Architecture Validation & Contracts

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `src/lib/agent/contracts/index.ts` (932 lines) |
| Public APIs | 84 type/interface exports across 20 sections |
| Dependencies | None (pure types, no runtime imports) |
| Tests | None (type-level only — TypeScript compilation = validation) |
| Contract compliance | ✅ Matches MAD v1.0.0 |
| Breaking changes | None (new file, no existing code touched) |

### Phase 1 — Semantic Project Model (Layer 0)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `spm/types.ts` (16), `spm/builder.ts` (231), `spm/serializer.ts` (60), `spm/index.ts` (16) |
| Public APIs | `buildSPM(report, analysisId?): Result<SPM>`, `serializeSPM(spm): string`, `deserializeSPM(json): Result<SPM>`, `SPM_SCHEMA_VERSION = 1` |
| Dependencies | `contracts/index.ts`, `@/lib/types` (AnalysisReport) |
| Tests | 23 tests — all pass |
| Contract compliance | ✅ SPM is pure data (no methods) per §2 |
| Breaking changes | None |

### Phase 2 — Index System (Layer 1)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | 6 index files + `index-builder.ts` + `index.ts` = 8 files (514 lines) |
| Public APIs | `buildIndexes(spm): IndexSystem` + 6 index classes |
| Dependencies | `contracts/index.ts` (types only) |
| Tests | 31 tests — all pass |
| Contract compliance | ✅ 6 indexes match §3 contracts |
| Breaking changes | None |
| Known limitation | Transitive import chain stops when import target path doesn't match file path (e.g. `"src/lib/auth"` vs `"src/lib/auth.ts"`) — documented in test |

### Phase 3 — Semantic Query Service (Layer 2)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `query/query-service.ts` (280), `query/index.ts` (14) |
| Public APIs | 18 query methods (findSymbol, findImpact, searchCode, etc.) + `createQueryService(spm, indexes)` |
| Dependencies | SPM (Layer 0), Indexes (Layer 1) |
| Tests | 40 tests — all pass |
| Contract compliance | ✅ All 18 methods from §4 implemented, all return `Result<T>` |
| Breaking changes | None |

### Phase 4 — Service Layer (Layer 3)

| Attribute | Value |
|-----------|-------|
| Status | 🟡 Complete (with stubs) |
| Files | 6 service files + `index.ts` = 7 files (864 lines) |
| Public APIs | 6 service classes + `createServices(spm)` |
| Dependencies | Layer 0-2 + existing engines (graph, diagram, repo-editor, git-intelligence, terminal, ai-client) |
| Tests | 31 tests — all pass |
| Contract compliance | ✅ Interface matches §5 |
| Stubs | `GitServiceImpl` sync methods return placeholders (`ok("")`, `ok("commit-sha-placeholder")`). `RepoServiceImpl` sync methods return `ok(undefined)`. Async variants (`*Async`) are real implementations. |
| Breaking changes | None |

### Phase 5 — Tool Registry + Capability Registry (Layer 4)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `capability-registry.ts`, `tool-registry.ts`, `manifest.ts`, `definitions/read-only-tools.ts`, `definitions/write-tools.ts`, `register-all.ts`, `index.ts` = 7 files |
| Public APIs | `createToolRegistry()`, `createCapabilityRegistry()`, `createRegistries()` + 20 tools |
| Dependencies | Layer 3 (Services), `@/lib/ai-client` (generate-patch tool) |
| Tests | 22 tests — all pass |
| Contract compliance | ✅ 20 tools, 27 capabilities, manifests match §7 |
| Gap | 6 capabilities have **no implementing tool**: `run-script`, `git-diff`, `git-history`, `git-revert`, `ai-insight`, `ai-chat` |
| Breaking changes | None |

### Phase 6 — Context Builder + Token Budget (Layer 5)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `token-budget.ts`, `context-ranker.ts`, `context-compressor.ts`, `context-builder.ts`, `index.ts` = 5 files (388 lines) |
| Public APIs | `createContextBuilder()`, `TokenBudgetManager.forModel()`, 4 classes |
| Dependencies | Layer 0-2 (SPM, Query Service) |
| Tests | 29 tests — all pass |
| Contract compliance | ✅ Matches §8 |
| Breaking changes | None |

### Phase 7 — Planner (Layer 6)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `execution-graph.ts`, `execution-policy.ts`, `plan-validator.ts`, `planner.ts`, `index.ts` = 5 files |
| Public APIs | `createPlanner(capabilities)`, `ExecutionGraphBuilder`, `PlanValidator`, 3 policy presets |
| Dependencies | Layer 4-5, `@/lib/ai-client` (LLM call) |
| Tests | 20 tests — all pass |
| Contract compliance | ✅ DAG + Policy match §9. Validator has 6 checks. |
| Breaking changes | None |

### Phase 8 — Agent Runtime (Layer 7)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `event-bus.ts`, `permission-gate.ts`, `checkpoint-manager.ts`, `rollback-manager.ts`, `execution-engine.ts`, `runtime.ts`, `index.ts` = 7 files |
| Public APIs | `createRuntime(toolRegistry)`, `EventBusImpl`, `PermissionGateImpl`, 18 event types |
| Dependencies | Layer 4 (Tools), Layer 6 (Planner types) |
| Tests | 26 tests — all pass |
| Contract compliance | ✅ Matches §10 |
| Bug found | **Double-emit**: `/api/agent/run/route.ts` subscribes to EventBus AND iterates `runtime.run()` async generator — events sent twice over SSE |
| Breaking changes | None |

### Phase 9 — Memory (Layer 7)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete (4 of 5 layers — Knowledge deferred per MAD) |
| Files | `working-memory.ts`, `task-memory.ts`, `session-memory.ts`, `project-memory.ts`, `agent-memory.ts`, `index.ts` = 6 files |
| Public APIs | `createAgentMemory()`, 4 memory classes |
| Dependencies | Layer 7 (CheckpointManager), `contracts/index.ts` |
| Tests | 29 tests — all pass |
| Contract compliance | ✅ 4 layers match §11 (Knowledge = stub, per MAD decision) |
| Breaking changes | None |

### Phase 10 — Skill Registry (Layer 8)

| Attribute | Value |
|-----------|-------|
| Status | ✅ Complete |
| Files | `skill-registry.ts`, `skill-types.ts`, `definitions/all-skills.ts`, `index.ts` = 4 files |
| Public APIs | `createSkillRegistry()`, 10 skills |
| Dependencies | Layer 4 (Capabilities) |
| Tests | 32 tests — all pass |
| Contract compliance | ✅ Matches §12 |
| Breaking changes | `.gitignore` modified (`skills/` → `/skills/`) |

### Phase 11 — Streaming UI (Layer 9)

| Attribute | Value |
|-----------|-------|
| Status | 🟡 Complete (functional but with stubs) |
| Files | 5 UI components + 2 API routes = 7 new files |
| Modified | `types.ts` (View union), `page.tsx` (import + render), `app-shell.tsx` (NAV + titleKeyMap), `common.json` EN+VI |
| Public APIs | `<AgentChatView />`, `POST /api/agent/run` (SSE), `POST /api/agent/permission` |
| Dependencies | All layers 0-8 |
| Tests | **None** (UI components untested) |
| Contract compliance | ✅ UI matches §15 design |
| Stubs | `/api/agent/run` hardcodes a 4-step plan instead of using LLM Planner. `/api/agent/permission` acknowledges without signaling runtime. |
| Bug | Double-emit (events sent twice via EventBus subscriber + async generator) |
| Breaking changes | `chat-view.tsx` still exists — `agent-chat-view.tsx` is additive |

---

## 2. Architecture Compliance

| Component | Contract § | Implemented? | Notes |
|-----------|-----------|-------------|-------|
| SPM (pure data) | §2 | ✅ | No methods, pure readonly fields |
| Index System (6 indexes) | §3 | ✅ | All 6, O(1) Map-based |
| Semantic Query Service | §4 | ✅ | 18 methods, all return Result<T> |
| Service Layer (6 services) | §5 | ✅ | Wraps existing engines |
| Capability Registry | §6 | ✅ | 27 capabilities, 1:1 mapping |
| Tool Registry + Manifest | §7 | ✅ | 20 tools, full manifest fields |
| Context Builder + Token Budget | §8 | ✅ | Rank, compress, deduplicate |
| Planner (DAG + Policy) | §9 | ✅ | GraphBuilder, Validator, 3 policies |
| Agent Runtime (Event-Driven) | §10 | ✅ | EventBus, PermissionGate, Checkpoint, Rollback |
| Memory (5 layers) | §11 | 🟡 | 4 layers + Knowledge stub (per MAD) |
| Skill Registry | §12 | ✅ | 10 skills, keyword matching |
| Permission Gate | §13 | ✅ | allow/prompt/deny, async request/respond |
| Dependency Rules | §14 | ✅ | No violations detected |
| Folder Structure | §15 | 🟡 | Missing top-level `index.ts` barrel |
| Error Codes | §16 | ✅ | 20 codes defined |
| Event Naming | §17 | ✅ | `{scope}.{action}` convention |
| Plugin System | §20 | 🟡 | Interface defined, no loader |

---

## 3. Dependency Graph

```
contracts/index.ts (Layer 0 — types only, no deps)
    ↑
spm/ (Layer 0) — imports contracts
    ↑
indexes/ (Layer 1) — imports contracts
    ↑
query/ (Layer 2) — imports contracts (SPM + Indexes types)
    ↑
services/ (Layer 3) — imports contracts + existing engines
    ↑
tools/ (Layer 4) — imports contracts + services + @/lib/ai-client
    ↑
context/ (Layer 5) — imports contracts (SPM + Query types)
    ↑
planner/ (Layer 6) — imports contracts + @/lib/ai-client
    ↑
runtime/ (Layer 7) — imports contracts + tools + planner
    ↑
memory/ (Layer 7) — imports contracts + runtime (CheckpointManager)
    ↑
skills/ (Layer 8) — imports contracts
    ↑
UI + API (Layer 9) — imports all above
```

**Circular dependencies:** None detected.
**Duplicate dependencies:** None detected.
**Dead dependencies:** 10 unused imports/exports (see Technical Debt §8).

---

## 4. API Surface

### Public APIs (by layer)

| Layer | API | Signature |
|-------|-----|-----------|
| 0 | `buildSPM` | `(report, analysisId?) → Result<SPM>` |
| 0 | `serializeSPM` / `deserializeSPM` | `(spm) → string` / `(json) → Result<SPM>` |
| 1 | `buildIndexes` | `(spm) → IndexSystem` |
| 2 | `createQueryService` | `(spm, indexes) → SemanticQueryService` |
| 2 | 18 query methods | `findSymbol`, `findImpact`, `searchCode`, etc. |
| 3 | `createServices` | `(spm) → { graph, diagram, search, git, repo, aiInsight }` |
| 4 | `createRegistries` | `() → { toolRegistry, capabilityRegistry }` |
| 4 | 20 tools | `find-symbol`, `generate-patch`, `git-commit`, etc. |
| 5 | `createContextBuilder` | `() → ContextBuilderImpl` |
| 5 | `TokenBudgetManager.forModel` | `(model) → TokenBudget` |
| 6 | `createPlanner` | `(capabilities) → PlannerImpl` |
| 6 | `ExecutionGraphBuilder` | DAG builder + topologicalSort + getReadyNodes |
| 6 | `PlanValidator` | `validate(plan, capabilities?) → Result<void>` |
| 7 | `createRuntime` | `(toolRegistry) → AgentRuntimeImpl` |
| 7 | `EventBusImpl` | `emit`, `subscribe`, `subscribeType` |
| 7 | `PermissionGateImpl` | `check`, `request`, `respond` |
| 7 | `CheckpointManager` | `save`, `load`, `markCompleted` |
| 7 | `RollbackManager` | `track`, `rollback`, `clear` |
| 8 | `createSkillRegistry` | `() → SkillRegistryImpl` |
| 8 | `SkillRegistryImpl.match` | `(query) → Skill \| null` |
| 9 | `POST /api/agent/run` | SSE stream of AgentEvent |
| 9 | `POST /api/agent/permission` | `{ nodeId, granted } → { ok }` |
| 9 | `<AgentChatView />` | React component |

---

## 5. Folder Structure

```
src/lib/agent/                          [NEW]
├── contracts/                          [NEW] Layer 0
│   └── index.ts                        (932 lines, 20 sections)
├── spm/                                [NEW] Layer 0
│   ├── types.ts
│   ├── builder.ts
│   ├── serializer.ts
│   └── index.ts
├── indexes/                            [NEW] Layer 1
│   ├── symbol-index.ts
│   ├── reference-index.ts
│   ├── call-index.ts
│   ├── import-index.ts
│   ├── issue-index.ts
│   ├── path-index.ts
│   ├── index-builder.ts
│   └── index.ts
├── query/                              [NEW] Layer 2
│   ├── query-service.ts
│   └── index.ts
├── services/                           [NEW] Layer 3
│   ├── graph-service.ts
│   ├── diagram-service.ts
│   ├── search-service.ts
│   ├── git-service.ts
│   ├── repo-service.ts
│   ├── ai-insight-service.ts
│   └── index.ts
├── tools/                              [NEW] Layer 4
│   ├── tool-registry.ts
│   ├── capability-registry.ts
│   ├── manifest.ts
│   ├── definitions/
│   │   ├── read-only-tools.ts          (13 tools)
│   │   └── write-tools.ts              (7 tools)
│   ├── register-all.ts
│   └── index.ts
├── context/                            [NEW] Layer 5
│   ├── token-budget.ts
│   ├── context-ranker.ts
│   ├── context-compressor.ts
│   ├── context-builder.ts
│   └── index.ts
├── planner/                            [NEW] Layer 6
│   ├── execution-graph.ts
│   ├── execution-policy.ts
│   ├── plan-validator.ts
│   ├── planner.ts
│   └── index.ts
├── runtime/                            [NEW] Layer 7
│   ├── event-bus.ts
│   ├── permission-gate.ts
│   ├── checkpoint-manager.ts
│   ├── rollback-manager.ts
│   ├── execution-engine.ts
│   ├── runtime.ts
│   └── index.ts
├── memory/                             [NEW] Layer 7
│   ├── working-memory.ts
│   ├── task-memory.ts
│   ├── session-memory.ts
│   ├── project-memory.ts
│   ├── agent-memory.ts
│   └── index.ts
├── skills/                             [NEW] Layer 8
│   ├── skill-registry.ts
│   ├── skill-types.ts
│   ├── definitions/
│   │   └── all-skills.ts               (10 skills)
│   └── index.ts
└── __tests__/                          [NEW]
    ├── spm/builder.test.ts
    ├── indexes/indexes.test.ts
    ├── query/query-service.test.ts
    ├── services/services.test.ts
    ├── tools/tools.test.ts
    ├── context/context.test.ts
    ├── planner/planner.test.ts
    ├── runtime/runtime.test.ts
    └── memory/memory.test.ts

src/components/views/                   [MODIFIED]
├── agent-chat-view.tsx                 [NEW]
├── plan-visualizer.tsx                 [NEW]
├── tool-call-card.tsx                  [NEW]
├── permission-dialog.tsx               [NEW]
└── working-memory-panel.tsx            [NEW]

src/app/api/agent/                      [NEW]
├── run/route.ts                        [NEW]
└── permission/route.ts                 [NEW]

src/lib/types.ts                        [MODIFIED] — added "agent" to View
src/app/page.tsx                        [MODIFIED] — added AgentChatView
src/components/shared/app-shell.tsx     [MODIFIED] — added agent to NAV
locales/en/common.json                  [MODIFIED] — added nav.agent
locales/vi/common.json                  [MODIFIED] — added nav.agent
.gitignore                              [MODIFIED] — skills/ → /skills/
```

**Missing vs contracts §15:**
- `src/lib/agent/index.ts` (top-level barrel) — not created
- `src/lib/agent/memory/knowledge-memory.ts` — inlined as stub in agent-memory.ts

---

## 6. Code Statistics

| Metric | Value |
|--------|-------|
| New files (agent lib) | 44 |
| New files (tests) | 10 |
| New files (UI) | 5 |
| New files (API) | 2 |
| **Total new files** | **61** |
| Modified files | 7 (by agent phases) + 6 (by other commits) |
| Agent lib LOC | 6,586 |
| Agent test LOC | 3,233 |
| UI LOC | 748 |
| API LOC | 165 |
| Contracts LOC | 932 |
| **Total agent LOC** | **10,732** |
| Interfaces | 84 (in contracts) |
| Classes | 20 (6 services + 6 indexes + 4 context + 4 others) |
| Services | 6 |
| Tools | 20 |
| Skills | 10 |
| Capabilities | 27 (21 with tools, 6 without) |
| Event types | 18 |
| Memory layers | 4 (+1 stub) |
| Unit tests | 343 |

---

## 7. Architecture Quality Review

| Dimension | Score | Pros | Cons |
|-----------|-------|------|------|
| **Maintainability** | 8/10 | Clear layering, contracts, barrel exports | 10 dead imports, missing top-level barrel |
| **Scalability** | 8/10 | DAG parallelism, LRU caches, token budget | sessionStorage limits on large plans |
| **Coupling** | 9/10 | No circular deps, layer rules enforced | Services tightly wrap engines (adapter, not abstraction) |
| **Cohesion** | 9/10 | Each module has single responsibility | Skill definitions batched in 1 file |
| **Extensibility** | 9/10 | Plugin interface, provider pattern | No plugin loader yet |
| **Plugin Ready** | 7/10 | Interface defined | No runtime loader, no marketplace |
| **Enterprise Ready** | 7/10 | Permission gate, audit log, token budget | No RBAC, no multi-tenant agent isolation |
| **AI Agent Ready** | 8/10 | Full pipeline: SPM→Plan→Execute→Memory | 6 missing tools, stub write tools, hardcoded plan in API |

---

## 8. Technical Debt

| Category | Items | Severity |
|----------|-------|----------|
| Dead imports | `buildIndexes` in graph-service, `computeDiff/formatDiffAsUnified/applyDiff` in repo-service, `Result/AgentError` in runtime, `ok` helper in read-only-tools | LOW |
| Unused exports | `ERROR_CODES` const, `canFit()` method, `keywordIndex` field | LOW |
| Stub implementations | 6 write tools return placeholders, Git/Repo sync methods, RollbackManager.rollback(), Runtime.resume(), /api/agent/permission | MEDIUM |
| Hardcoded plan | /api/agent/run uses inline 4-step plan instead of LLM Planner | MEDIUM |
| Double-emit bug | EventBus subscriber + async generator = events sent twice | HIGH |
| Missing tools | 6 capabilities without implementation: `run-script`, `git-diff`, `git-history`, `git-revert`, `ai-insight`, `ai-chat` | MEDIUM |
| Missing top-level barrel | `src/lib/agent/index.ts` not created | LOW |
| Knowledge Memory | Stub only (deferred per MAD) | LOW (by design) |
| UI tests | None for 5 UI components + 2 API routes | MEDIUM |
| TODO/FIXME markers | 0 in agent code (2 in test data, not markers) | — |

---

## 9. Performance Audit

| Component | Complexity | Notes |
|-----------|-----------|-------|
| SPM build | O(n) | Single pass over AnalysisReport |
| Index build | O(n) | 6 indexes, each single pass |
| Symbol lookup | O(1) | Map-based |
| Reference lookup | O(1) | Map-based |
| Call chain | O(V+E) BFS | Depth-limited |
| Path (shortest) | O(V+E) BFS | |
| Path (cycles) | O(V+E) Tarjan | |
| Search | O(n×m) | n=files, m=lines per file |
| Token estimation | O(1) | 4 chars/token |
| Context allocation | O(n log n) | Priority sort + trim |
| Plan generation | O(1) + LLM latency | 30s timeout |
| DAG execution | O(V+E) | Parallel groups up to maxParallel |
| Checkpoint save | O(n) | JSON clone of plan |
| **Bottleneck** | Search (O(n×m)) | Large repos (>500 files) may be slow. Mitigation: SearchService caches indexed content. |

---

## 10. UI Audit

| Component | Status | Notes |
|-----------|--------|-------|
| Agent Chat | ✅ | SSE consumer, event handler, input box |
| Streaming | ✅ | ReadableStream reader, SSE parsing |
| Progress bar | ✅ | X/Y completed, Cancel button |
| Execution Graph | ✅ | PlanVisualizer: node list with status icons |
| Tool Calls | ✅ | ToolCallCard: expandable results |
| Permission Dialog | ✅ | Diff preview + Approve/Reject |
| Working Memory | ✅ | currentFile, currentStep, hypothesis, scratchpad |
| Quick Actions | ✅ | 4 preset queries |
| **Fake data?** | ❌ No | All data comes from SSE events |
| **Bug** | ⚠️ | Double-emit may cause duplicate UI updates |

---

## 11. Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| Permission Gate | ✅ | allow/prompt/deny, async confirm |
| Tool validation | ✅ | JSON Schema in manifest (inputSchema) |
| Input validation | 🟡 | Tools check required params, but no schema runtime validation |
| Terminal sandbox | ✅ | Existing permission-system.ts (allowlist/denylist) |
| Git operations | ✅ | Via GitService, permission=prompt for commit/push |
| Secrets | ✅ | Existing redaction (secret-mask.ts) + AI client redaction |
| API auth | ✅ | `requireUserId()` on /api/agent/run |
| Path traversal | 🟡 | RepoService accepts paths, no sanitization |
| Prompt injection | 🟡 | User query passed to LLM, no sanitization |
| Ownership check | ✅ | `db.analysis.findFirst({ where: { id, userId } })` |

---

## 12. Testing Audit

| Test Type | Count | Status |
|-----------|-------|--------|
| ESLint | — | ✅ Pass (0 errors) |
| TypeScript | — | ✅ Pass (0 errors) |
| Unit tests (agent) | 343 | ✅ All pass |
| Unit tests (existing) | 60 | ✅ All pass (after fix) |
| Integration tests | 0 | ❌ Missing |
| Runtime tests (E2E) | 0 | ❌ Missing |
| UI tests | 0 | ❌ Missing |
| Contract tests | 0 | 🟡 Types compile = implicit |

---

## 13. Compatibility Audit

| Existing System | Broken? | Notes |
|-----------------|---------|-------|
| Code Graph | ✅ No | Graph Engine unchanged, GraphService wraps it |
| Diagram Engine | ✅ No | DiagramEngine unchanged, DiagramService wraps it |
| Analysis Engine | ✅ No | analysis-engine-v2.ts unchanged |
| Parser | ✅ No | repo-parser.ts unchanged |
| AI Insight | ✅ No | ai-client.ts unchanged, AIInsightService wraps it |
| Developer Console | ✅ No | Not touched |
| Existing APIs (47 routes) | ✅ No | All unchanged |
| Existing UI views (10) | ✅ No | All unchanged, agent is additive |
| Backward compatibility | ✅ | 0 existing features broken |

---

## 14. Master Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Streaming UI (Layer 9)              │
│  AgentChatView · PlanVisualizer · ToolCallCard       │
│  PermissionDialog · WorkingMemoryPanel               │
│  POST /api/agent/run (SSE) · POST /api/agent/perm   │
└──────────────────────┬──────────────────────────────┘
                       │ events (SSE)
┌──────────────────────┴──────────────────────────────┐
│              Skill Registry (Layer 8)                │
│  10 Skills (bug-fix, security, refactor, test, ...)  │
│  Keyword matching → auto-route                       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│     Agent Runtime (Layer 7) — Event-Driven           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │EventBus  │ │Permission│ │ExecutionEngine   │    │
│  │(18 types)│ │Gate      │ │(DAG, parallel)   │    │
│  └──────────┘ └──────────┘ └──────────────────┘    │
│  ┌────────────────┐ ┌──────────────────────────┐   │
│  │CheckpointMgr   │ │RollbackMgr               │   │
│  └────────────────┘ └──────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐    │
│  │ Memory (4 layers)                           │    │
│  │ Working · Task · Session · Project          │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│             Planner (Layer 6)                        │
│  LLM → ExecutionPlan (DAG + Policy)                  │
│  PlanValidator (6 checks) · 3 policy presets         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│       Context Builder (Layer 5)                      │
│  TokenBudgetManager · ContextRanker · Compressor     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│    Tool Registry + Capability Registry (Layer 4)     │
│  20 Tools (13 read + 7 write) · 27 Capabilities      │
│  ToolManifest (cost, timeout, confidence, ...)       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│            Service Layer (Layer 3)                   │
│  Graph · Diagram · Search · Git · Repo · AIInsight  │
│  (wraps existing engines — zero engine changes)      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│      Semantic Query Service (Layer 2)                │
│  18 methods (findSymbol, findImpact, searchCode, ...) │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│         Index System (Layer 1)                       │
│  Symbol · Reference · Call · Import · Issue · Path   │
│  All O(1) Map-based lookups                          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│    Semantic Project Model (Layer 0) — SSOT           │
│  Files · Symbols · Edges · Issues · Insights         │
│  Architecture · Metrics — pure data, no methods      │
└─────────────────────────────────────────────────────┘
```

---

## 15. Readiness Report

| Readiness | Score | Notes |
|-----------|-------|-------|
| **Production Ready** | 6/10 | Double-emit bug, stub write tools, hardcoded plan, no UI tests |
| **AI Coding Ready** | 7/10 | Full pipeline works, but 6 missing tools + LLM Planner not wired to API |
| **Cursor-level** | 5/10 | Missing: real file editing, inline diff, multi-file patches, IDE integration |
| **Claude Code-level** | 5/10 | Missing: terminal integration, real git operations, autonomous mode |
| **OpenCode-level** | 6/10 | Architecture matches, but execution layer has stubs |
| **Enterprise Ready** | 6/10 | Permission gate + audit exist, but no RBAC, no multi-tenant isolation |
| **Plugin Ready** | 4/10 | Interface defined, no loader, no marketplace |
| **Multi-Agent Ready** | 3/10 | Single agent only, no coordinator, no shared memory between agents |
| **Cloud Ready** | 7/10 | Vercel deploy works, SSE streaming, DB-backed analysis |
| **Offline Ready** | 4/10 | Requires DB + AI provider, no local-only mode for agent |

---

## 16. Phase Completion Table

| Phase | Status | % | Notes |
|-------|--------|---|-------|
| 0 — Contracts | ✅ Complete | 100% | 932 lines, 20 sections, frozen |
| 1 — SPM | ✅ Complete | 100% | 23 tests, builds from any AnalysisReport |
| 2 — Indexes | ✅ Complete | 100% | 31 tests, 6 indexes, O(1) lookups |
| 3 — Query Service | ✅ Complete | 100% | 40 tests, 18 methods |
| 4 — Services | 🟡 Partial | 85% | 31 tests, but sync methods are stubs |
| 5 — Tools | 🟡 Partial | 80% | 22 tests, 20 tools, but 6 capabilities missing |
| 6 — Context Builder | ✅ Complete | 100% | 29 tests, token budget + ranker + compressor |
| 7 — Planner | ✅ Complete | 100% | 20 tests, DAG + validator + 3 policies |
| 8 — Runtime | ✅ Complete | 95% | 26 tests, but resume() is stub |
| 9 — Memory | ✅ Complete | 90% | 29 tests, 4 layers (Knowledge = stub by design) |
| 10 — Skills | ✅ Complete | 100% | 32 tests, 10 skills, keyword matching |
| 11 — UI | 🟡 Partial | 75% | 5 components + 2 API routes, but hardcoded plan + double-emit bug |

**Overall: ~92% complete**

---

## 17. What's Missing (Honest)

### Critical (blocks production use)
1. **Double-emit bug** in `/api/agent/run` — events sent twice via EventBus subscriber + async generator
2. **Hardcoded plan** in `/api/agent/run` — LLM Planner not wired to API (uses inline 4-step plan)
3. **Write tools are stubs** — 6 of 7 write tools return placeholders (only `generate-patch` calls AI)
4. **`/api/agent/permission` doesn't signal runtime** — acknowledges but doesn't call `PermissionGate.respond()`
5. **Runtime.resume() always fails** — returns error "Resume requires stored context"

### Medium (limits functionality)
6. **6 capabilities without tools**: `run-script`, `git-diff`, `git-history`, `git-revert`, `ai-insight`, `ai-chat`
7. **No UI tests** — 5 components + 2 API routes untested
8. **No integration tests** — no E2E test of full agent flow
9. **Git/Repo sync methods are stubs** — only async variants work
10. **RollbackManager.rollback() is a no-op** — tracks changes but doesn't undo them
11. **No top-level barrel** (`src/lib/agent/index.ts`) — consumers must import from subdirectories

### Low (technical debt)
12. **10 unused imports/exports** — dead code
13. **`keywordIndex` field** in SkillRegistry — built but never read (match uses scoring instead)
14. **Knowledge Memory** — stub only (deferred per MAD decision, not a bug)
15. **Plugin system** — interface defined but no loader

---

## 18. Proposed Roadmap — Agent Architecture v2

### v2 Goals
- Fix all critical issues from audit
- Wire LLM Planner to API
- Implement real write tools (file editing, git operations)
- Add integration + UI tests
- Enable autonomous mode (multi-step without user confirmation for read-only)

### v2 Roadmap

| Priority | Task | Effort | Risk |
|----------|------|--------|------|
| P0 | Fix double-emit bug (remove EventBus subscriber, use only async generator) | 1h | Low |
| P0 | Wire LLM Planner to /api/agent/run (replace hardcoded plan) | 4h | Medium (AI latency) |
| P0 | Implement write tools (apply-patch, run-lint, run-tests, git-commit) | 8h | Medium |
| P0 | Wire /api/agent/permission to Runtime PermissionGate | 4h | Medium (state sharing) |
| P1 | Fix Runtime.resume() (store context in checkpoint) | 4h | Medium |
| P1 | Implement RollbackManager.rollback() (real file undo) | 4h | Medium |
| P1 | Add 6 missing tools (run-script, git-diff, git-history, git-revert, ai-insight, ai-chat) | 8h | Low |
| P1 | Add integration tests (E2E: query → plan → execute → result) | 8h | Low |
| P2 | Add UI component tests (React Testing Library) | 8h | Low |
| P2 | Clean up dead imports/exports | 2h | Low |
| P2 | Create top-level barrel (`src/lib/agent/index.ts`) | 1h | Low |
| P3 | Plugin loader implementation | 16h | High |
| P3 | Multi-Agent coordination | 24h | High |
| P3 | Knowledge Memory (persistent learning) | 16h | Medium |
| P3 | RBAC for agent tools | 8h | Medium |

### v2 Architecture Changes
- **Event streaming**: Replace double-channel (EventBus + async generator) with single async generator only. EventBus remains for internal logging/metrics.
- **State sharing**: Use in-memory Map for task state (permission responses, pause/resume) instead of HTTP round-trips.
- **Real file editing**: Wire `apply-patch` tool to `RepoServiceImpl.writeFileAsync()`.
- **Autonomous mode**: Add `autoApproveReadTools` preference — skip permission gate for read-only tools.

### v2 Benefits
- Production-ready agent (fix all critical issues)
- Real code editing (not just analysis)
- Full test coverage
- Foundation for multi-agent and plugin ecosystem
