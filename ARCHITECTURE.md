# CodeInsight AI — Master Architecture Document (MAD)
**Version:** 1.0.0 — FROZEN
**Status:** Awaiting user approval. No implementation until "Bắt đầu Phase 0" is confirmed.
**Scope:** Coding Agent system targeting Cursor / Claude Code / OpenCode parity.

---

## 0. Document Purpose

This document is the **single source of truth** for CodeInsight AI Agent architecture. It:
- Inventories what EXISTS today (factual, audited)
- Critiques the existing architecture (with reasoning)
- Freezes the target architecture (interfaces + dependency rules)
- Defines a phased roadmap with explicit entry/exit criteria

**Non-goals:** This document does NOT contain implementation code. It defines contracts, rules, and structure. Implementation happens only after explicit approval.

---

## 1. Codebase Inventory (Factual)

> Source: AUDIT-1 worklog entry. All facts verified against actual source files.

### 1.1 Analysis Pipeline

| Component | File | Role |
|-----------|------|------|
| Analysis engine | `src/lib/analysis-engine-v2.ts` (654 lines) | `analyzeParsedRepository(parsed, rawFiles?, language)` — pure static analyzer, returns `AnalysisReport` |
| Parser | `src/lib/repo-parser.ts` (920 lines) | GitHub clone + AST-free file scanner; produces `ParsedRepo` (files, languages, frameworks, deps, entry points) |
| Security analyzer | `src/lib/analyzers/security.ts` (300 lines) | 90 rules (13 inline patterns + 77 extra rules). Multi-language: Python, PHP, Java, Go, JS/TS, C/C++ |
| Bugs analyzer | `src/lib/analyzers/bugs.ts` (260 lines) | 80 rules (11 inline + 69 extra). Multi-language footguns |
| Performance analyzer | `src/lib/analyzers/performance.ts` (404 lines) | 80 rules (42 inline + 38 extra). Bundle, async, query, memory, layout |
| Architecture analyzer | `src/lib/analyzers/architecture.ts` | Robert C. Martin component principles (cohesion, coupling, layer violations, god modules) |
| AI deep analysis | `src/lib/ai-deep-analysis-helpers.ts` (216 lines) | `buildPromptForPass(passType, parsed, report)` — 9 pass types, top-8 issues per category |
| AI enhancement | `src/lib/ai-enhance.ts` | Post-static AI summary pass |
| Static analysis stats | `src/lib/static-analysis-stats.ts` | Derives counts from analyzer exports (250 total) |

**Total static rules: 250** (90 security + 80 bugs + 80 performance). Verified by counting `key:` entries in `*_EXTRA_RULES` arrays.

### 1.2 Graph Engine

| File | Role |
|------|------|
| `src/lib/graph/types.ts` | `GraphNode`, `GraphEdge`, `GraphStats`, `InspectorData`, `GraphAIConfig` |
| `src/lib/graph/graph-engine.ts` | `GraphService` facade — combines Index + Algorithms + Query + Impact |
| `src/lib/graph/graph-index.ts` | O(1) lookups: by node ID, by type, by file |
| `src/lib/graph/graph-algorithms.ts` | Cycle detection (Tarjan), shortest path (BFS), topological sort |
| `src/lib/graph/graph-query.ts` | Semantic queries: search, top-N, inspector |
| `src/lib/graph/graph-impact.ts` | `ImpactReport` — direct + transitive impact of a node change |
| `src/lib/graph/ai-analysis-service.ts` | AI insight on graph (separated from engine) |
| `src/lib/graph/providers/` | 6 providers: `dependency`, `call-graph`, `class-hierarchy`, `module-imports`, `api-flow`, `database-flow` |
| `src/lib/codegraph/builder.ts` | Builds `CodeGraph` from `AnalysisReport`, persists as `CodeGraphSnapshot` |

**Architecture:** Provider pattern — all 6 providers normalize to the same `GraphData` shape `{ nodes, edges, stats }`. `GraphService` is a facade over 4 internal modules.

### 1.3 Diagram Engine

| File | Role |
|------|------|
| `src/lib/diagram/types.ts` | `DiagramType`, `DiagramLayout`, `DiagramData` |
| `src/lib/diagram/diagram-engine.ts` | `DiagramEngine` — plugin API (`registerProvider/Layout/Exporter`) |
| `src/lib/diagram/diagram-layout.ts` | 4 layouts: dagre-tb, dagre-lr, circular, force |
| `src/lib/diagram/diagram-query.ts` | Query + index |
| `src/lib/diagram/diagram-cache.ts` | LRU cache (50 entries, 5min TTL) |
| `src/lib/diagram/diagram-export.ts` | 3 formats: SVG, Mermaid, PlantUML |
| `src/lib/diagram/diagram-renderer.tsx` | Interactive SVG renderer (React) |
| `src/lib/diagram/providers/` | 6 providers: `architecture`, `component`, `sequence`, `erd`, `module`, `uml` |

**Architecture:** Full plugin system. Adding a new diagram type = register a provider, no engine changes.

### 1.4 Code Explorer

| File | Role |
|------|------|
| `src/components/shared/code-viewer.tsx` | IDE-level code viewer: expand context, file summaries, issue highlighting, 6 AI modes, related files, sessionStorage persistence |

### 1.5 Repo Editor

| File | Role |
|------|------|
| `src/lib/repo-editor/file-operations.ts` | create / read / update / delete files |
| `src/lib/repo-editor/diff-engine.ts` | Generate unified diffs |
| `src/lib/repo-editor/import-updater.ts` | Auto-update imports when a file moves |
| `src/lib/repo-editor/change-history.ts` | Track all changes (undo/redo) |
| `src/lib/repo-editor/index.ts` | Facade |

### 1.6 Git Intelligence

| File | Role |
|------|------|
| `src/lib/git-intelligence/git-operations.ts` | git add / commit / push / reset / revert |
| `src/lib/git-intelligence/diff-reviewer.ts` | AI reviews a diff |
| `src/lib/git-intelligence/commit-message-generator.ts` | AI generates conventional commit messages |
| `src/lib/git-intelligence/changelog-generator.ts` | AI generates changelog from commit history |

### 1.7 Terminal

| File | Role |
|------|------|
| `src/lib/terminal/command-runner.ts` | Execute shell commands with timeout + AbortSignal |
| `src/lib/terminal/permission-system.ts` | 3-level permission: `allow` / `prompt` / `deny`. Allowlist + denylist + heuristic dangerous-substring detection |
| `src/lib/terminal/command-history.ts` | Persist command history |

**Permission levels (verified):**
- `allow`: ls, pwd, cat, echo, head, tail, wc, find, grep, rg, tree, file, stat, du, df, uname, git status, git diff, git log, npm test, npx tsc, etc.
- `prompt`: git commit, git push, npm install (local), bun install
- `deny`: rm -rf /, rm -rf ~, mkfs, dd, shutdown, reboot, chmod 777, git push --force, git reset --hard, npm install -g

### 1.8 Existing Agents

| File | Agent | Role |
|------|-------|------|
| `base-agent.ts` | `BaseAgent` | Abstract base: `run(task, signal, onProgress)` |
| `bug-fixer.ts` | `BugFixerAgent` | Generates + verifies patches (tsc + lint) |
| `test-agent.ts` | `TestAgent` | Generates test files |
| `refactoring-agent.ts` | `RefactoringAgent` | Refactors code |
| `security-agent.ts` | `SecurityAgent` | Security audit + fix suggestions |
| `performance-agent.ts` | `PerformanceAgent` | Performance audit |
| `documentation-agent.ts` | `DocumentationAgent` | Generates docs |
| `code-reviewer.ts` | `CodeReviewerAgent` | Reviews code |
| `repository-analyst.ts` | `RepositoryAnalystAgent` | Repo overview |
| `devops-agent.ts` | `DevOpsAgent` | CI/CD, Docker, deployment |
| `pr-generator.ts` | `PRGenerator` (helper, not BaseAgent) | Generates PR descriptions |

**Architecture:** Direct-call model. `AGENT_MAP` in `/api/agents/execute/route.ts` maps `TaskKind` → agent instance. No orchestrator, no scheduler, no event bus, no shared memory. Mission Control was REMOVED.

### 1.9 AI Client

| File | Role |
|------|------|
| `src/lib/ai-client.ts` | Unified `callAI()` / `streamAI()` / `callAIForJSON()`. Supports 15 providers. Secret redaction on every message. `AICallLog` telemetry. Monthly `TokenBudgetExceededError` pre-flight |
| `src/lib/platform-ai.ts` | `getPlatformAIProvider()` — admin-configured default provider |
| `src/lib/ai-fallback.ts` | `callAIWithFallback()` — 3 attempts max, 20s each |
| `src/lib/agents/ai-client.ts` | Wrapper for backward compat (delegates to `lib/ai-client.ts`) |

### 1.10 Analysis Manifest (existing abstraction)

| File | Role |
|------|------|
| `src/lib/analysis-manifest.ts` | `ANALYSIS_PASSES` (9 passes), `ANALYSIS_TABS` (10 tabs), `buildManifest(report, analysisId)`. UI reads from manifest, never hardcodes |
| `src/hooks/use-analysis-manifest.ts` | React hook wrapping `buildManifest` + `aiPending` override |

### 1.11 API Routes (47 routes)

**Analysis:** `/api/analyze`, `/api/analyze/ai-pass`, `/api/parse`, `/api/report`, `/api/jobs/[id]`
**AI:** `/api/chat`, `/api/chat/stream`, `/api/agents/execute`, `/api/search`, `/api/docs/enhance`
**Graph/Diagram:** `/api/graph/[analysisId]`, `/api/diagram/[analysisId]`
**Git:** `/api/git/operation`, `/api/terminal/run`
**Analysis diff:** `/api/analysis/diff`, `/api/analysis/diff/ai-summary`, `/api/analysis/regressions`, `/api/analysis/refactor-roadmap`, `/api/analysis/timeline`
**Billing:** `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook`
**Admin:** `/api/admin/*` (users, stats, audit, usage, policies, platform-ai, test-ai, subscriptions)
**Auth:** `/api/auth/[...nextauth]`
**Other:** `/api/health`, `/api/history`, `/api/reset`, `/api/settings`, `/api/share`, `/api/share/[token]`, `/api/providers`, `/api/providers/credentials`, `/api/providers/test`, `/api/usage`, `/api/usage/tokens`, `/api/usage/trends`

### 1.12 UI Views

| View | Role |
|------|------|
| `landing-view.tsx` | Marketing landing + repo input |
| `analyze-view.tsx` | Analysis progress UI (8 stages, smooth progress) |
| `project-view.tsx` | Main report: 10 tabs (overview, architecture, bugs, security, performance, codegraph, code, docs, roadmap, timeline) |
| `dashboard-view.tsx` | Scores, charts, recent analyses, trends |
| `chat-view.tsx` | AI chat about repository |
| `history-view.tsx` | Past analyses |
| `settings-view.tsx` | Profile, AI providers, personalization, danger zone |
| `providers-view.tsx` | BYOK provider config + model routing |
| `admin-view.tsx` | Admin dashboard (6 tabs) |
| `personalities-view.tsx` | AI personality config |

### 1.13 Storage Layer

**Prisma models (18):** User, Account, Session, VerificationToken, Analysis, ChatMessage, FileSummary, CodeGraphSnapshot, UserSettings, ProviderCredential, UsageRecord, TokenUsageRecord, RateLimitBucket, ShareToken, AuditLog, PlatformAIConfig, AICallLog, Policy

**Zustand stores (5):** `store.ts` (app state: view, activeReport, chat, aiPending), `personalization-store.ts`, `providers-store.ts`, `developer-mode-store.ts`, `personality-store.ts`

### 1.14 Existing Agent Contracts (Phase 0)

`src/lib/agent/contracts/index.ts` (933 lines) — 20 sections of interfaces only, no implementation. Covers: Result Model, SPM, Index System, Query Service, Service Layer, Capability Registry, Tool Registry + Manifest, Context Builder + Token Budget, Planner (DAG + Policy), Runtime (Event-Driven), Memory (5 layers), Skill Registry, Permission Gate, Dependency Rules, Folder Structure, Error Codes, Event Naming, Logging, Metrics, Plugin Convention.

### 1.15 Types

`src/lib/types.ts` (419 lines) — `AnalysisReport`, `Issue`, `AnalysisStage`, `View`, `ChatMessage`, `CodeSnippet`, `AIMode`, `ProviderId`, etc.

---

## 2. Architecture Critique

### 2.1 What works well (KEEP)

1. **Plugin architecture in Diagram Engine** — `registerProvider/Layout/Exporter` is clean. Adding diagram types requires zero engine changes. ✅
2. **Graph Engine facade pattern** — `GraphService` composes 4 focused modules (Index, Algorithms, Query, Impact). SRP respected. ✅
3. **Analysis Manifest as SSOT for UI** — UI reads `ANALYSIS_PASSES` / `ANALYSIS_TABS`, never hardcodes. This pattern should extend to the Agent system. ✅
4. **Permission System 3-level** — `allow` / `prompt` / `deny` with allowlist + denylist + heuristics. Production-ready. ✅
5. **AI Client enterprise hardening** — Secret redaction, telemetry, token budget, fallback chain. ✅
6. **Provider normalization** — 15 AI providers + 6 graph providers + 6 diagram providers all normalize to uniform shapes. ✅

### 2.2 What needs fixing

| Issue | Severity | Description |
|-------|----------|-------------|
| **No SSOT for project data** | 🔴 HIGH | `AnalysisReport` is the de-facto SSOT but it's a transport type, not a queryable model. Graph Engine, Diagram Engine, Code Explorer, Agents each re-parse it independently. 4+ separate "understandings" of the same project. |
| **Agents are siloed** | 🔴 HIGH | 9 agents each call `callAI()` directly, build their own context, no shared memory, no coordination. Can't compose "find bug → fix → test → commit" as one flow. |
| **No tool abstraction** | 🟡 MEDIUM | Agents call engines directly (`graphEngine.query(...)`, `repoEditor.writeFile(...)`). No tool registry, no manifest, no permission integration at call site. |
| **No Planner** | 🟡 MEDIUM | User manually selects agent from dropdown. No LLM-driven plan generation. No DAG. No parallel execution. |
| **No streaming agent output** | 🟡 MEDIUM | `/api/agents/execute` returns one JSON blob. No SSE, no progress streaming, no intermediate tool calls visible. |
| **Context not budgeted** | 🟡 MEDIUM | Each agent sends full context to LLM. No token budget management. Risk of overflow on large repos. |
| **Memory is stateless** | 🟡 MEDIUM | No conversation memory, no task memory, no learned patterns. Each agent run starts from scratch. |
| **`AnalysisReport` is overloaded** | 🟢 LOW | It carries static analysis + AI deep analysis + metadata. Should split into transport vs semantic model. |

### 2.3 Over-engineering risks to AVOID

Based on the Phase 0 contracts, I identify these risks:

| Risk | Mitigation |
|------|------------|
| **5-layer Memory is too many** | Working + Task + Session + Project + Knowledge. If Knowledge Memory is not used in first 6 months, it's dead code. **Decision: implement 4 layers first (Working, Task, Session, Project). Add Knowledge when there's a real use case.** |
| **Capability Registry may be premature** | If each capability maps to exactly 1 tool, the registry is an indirection layer with no value. **Decision: implement Capability Registry but only require it when ≥2 tools fulfill the same capability. Start with 1:1 mapping.** |
| **Tool Manifest `confidence` field** | Useful only when multiple providers compete. **Decision: include in manifest but default to 1.0. Only used for provider selection in multi-provider scenarios.** |
| **Event Bus with 18 event types** | Too many events upfront. **Decision: start with 8 core events (plan.generated, node.started, node.completed, node.failed, permission.requested, task.completed, task.failed, task.cancelled). Add others as needed.** |
| **Plugin Convention** | `AgentPlugin` interface with 4 hooks. **Decision: define interface but don't build plugin loader until 3rd party plugins are requested.** |

### 2.4 Circular dependency risks

| Risk | Prevention |
|------|------------|
| SPM importing from Services | SPM is Layer 0 (pure data). Cannot import anything except types. |
| Tools importing from Planner | Tools are Layer 4. Planner is Layer 6. Tools cannot import Planner. |
| Runtime importing from UI | Runtime is Layer 7. UI is Layer 9. Runtime cannot import UI. UI subscribes to Runtime via EventBus. |
| Agents importing from each other | Agents become Skills (Layer 8). Skills cannot import other Skills. They share Tools (Layer 4) and Memory (Layer 7). |

---

## 3. Target Architecture (FROZEN)

### 3.1 Architecture Diagram

```
                    ┌─────────────────┐
                    │   Streaming UI   │  Layer 9
                    │ (EventBus subscr)│
                    └────────┬────────┘
                             │ events
                    ┌────────┴────────┐
                    │  Skill Registry  │  Layer 8
                    │ (bug-fix, test,  │
                    │  refactor, etc.) │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌──────────┐    ┌──────────────┐  ┌──────────────┐
    │ Runtime  │    │   Memory     │  │ Permission   │  Layer 7
    │ (Event   │    │ (4 layers)   │  │ Gate         │
    │  Driven) │    │              │  │              │
    └────┬─────┘    └──────────────┘  └──────────────┘
         │
    ┌────┴────────────┐
    │   Planner       │  Layer 6
    │ (Execution DAG  │
    │  + Policy)      │
    └────┬────────────┘
         │
    ┌────┴────────────┐
    │ Context Builder │  Layer 5
    │ + Token Budget  │
    └────┬────────────┘
         │
    ┌────┴──────────────┐
    │ Capability Reg.   │  Layer 4
    │ + Tool Registry   │
    │ + Tool Manifest   │
    └────┬──────────────┘
         │
    ┌────┴────────────────────────────────┐
    │        Service Layer                │  Layer 3
    │ ┌─────────┐┌──────────┐┌─────────┐ │
    │ │GraphSvc ││DiagramSvc││SearchSvc│ │
    │ └─────────┘└──────────┘└─────────┘ │
    │ ┌─────────┐┌──────────┐┌─────────┐ │
    │ │ GitSvc  ││ RepoSvc  ││AIInsight│ │
    │ └─────────┘└──────────┘└─────────┘ │
    └────┬────────────────────────────────┘
         │
    ┌────┴────────────────────┐
    │ Semantic Query Service  │  Layer 2
    │ (findSymbol, findImpact,│
    │  searchCode, etc.)      │
    └────┬────────────────────┘
         │
    ┌────┴────────────────────┐
    │    Index System         │  Layer 1
    │ ┌────────┐┌──────────┐  │
    │ │Symbol  ││Reference │  │
    │ │Index   ││Index     │  │
    │ └────────┘└──────────┘  │
    │ ┌────────┐┌──────────┐  │
    │ │Call    ││Import    │  │
    │ │Index   ││Index     │  │
    │ └────────┘└──────────┘  │
    │ ┌────────┐┌──────────┐  │
    │ │Issue   ││Path      │  │
    │ │Index   ││Index     │  │
    │ └────────┘└──────────┘  │
    └────┬────────────────────┘
         │
    ┌────┴────────────────────┐
    │ Semantic Project Model  │  Layer 0
    │ (pure data — SSOT)      │
    │  files, symbols, edges, │
    │  issues, insights,      │
    │  architecture, metrics  │
    └─────────────────────────┘
```

### 3.2 Data Flow (example: "Fix bug login chậm")

```
User: "Fix bug login chậm"
  │
  ▼
1. SkillRegistry.match("fix bug login") → Skill: "bug-fix"
  │
  ▼
2. Planner.plan(query, context) → ExecutionPlan
   ├── Node A: searchCode("login") [capability: search-code, parallel group: "discover"]
   ├── Node B: findIssues(file: "login.ts") [capability: find-issues, parallel group: "discover"]
   ├── Node C: findCallChain("handleLogin") [depends: A, capability: find-call-chain]
   ├── Node D: findImpact("AuthService") [depends: C, capability: find-impact]
   ├── Node E: generatePatch(context: A+B+C+D) [depends: D, capability: generate-patch, permission: prompt]
   ├── Node F: applyPatch(patch: E.result) [depends: E, capability: apply-patch, permission: prompt]
   ├── Node G: runLint() [depends: F, capability: run-lint, parallel group: "verify"]
   └── Node H: runTests() [depends: F, capability: run-tests, parallel group: "verify"]
   Policy: { maxParallel: 3, defaultTimeout: 30000, rollbackOnFailure: true }
  │
  ▼
3. Runtime.run(plan) → streams events:
   ├── plan.generated
   ├── node.started (A, B — parallel)
   ├── node.completed (A) → WorkingMemory.currentFile = "src/auth/login.ts"
   ├── node.completed (B) → WorkingMemory.currentBug = issue
   ├── node.started (C)
   ├── node.completed (C)
   ├── node.started (D)
   ├── node.completed (D)
   ├── node.started (E) → ContextBuilder.build([A,B,C,D results], tokenBudget)
   ├── permission.requested (E — show patch diff)
   ├── permission.granted (user approves)
   ├── node.completed (E)
   ├── permission.requested (F — apply patch)
   ├── permission.granted
   ├── node.completed (F)
   ├── node.started (G, H — parallel)
   ├── node.completed (G) → lint passed
   ├── node.completed (H) → tests passed
   └── task.completed (summary)
```

---

## 4. Dependency Rules (FROZEN)

### 4.1 Layer dependency matrix

| Layer | Can import from | CANNOT import from |
|-------|----------------|-------------------|
| **0 — SPM** | (nothing — pure data + types) | Everything above |
| **1 — Indexes** | Layer 0 | Layers 2-9 |
| **2 — Query Service** | Layer 0, 1 | Layers 3-9 |
| **3 — Services** | Layer 0, 1, 2 + existing engines (graph, diagram, repo-editor, git-intelligence, terminal, ai-client) | Layers 4-9 |
| **4 — Tools + Capabilities** | Layer 0, 1, 2, 3 | Layers 5-9 |
| **5 — Context Builder** | Layer 0, 1, 2, 4 | Layers 6-9 |
| **6 — Planner** | Layer 0, 4, 5 | Layers 7-9 |
| **7 — Runtime + Memory + Permission** | Layer 4, 6 | Layers 8-9 |
| **8 — Skills** | Layer 4, 7 | Layer 9 |
| **9 — UI** | Layer 7, 8 | — |

### 4.2 Existing code rules

| Existing module | Can be imported by | Notes |
|----------------|-------------------|-------|
| `src/lib/graph/*` | Layer 3 (GraphService wraps it) | No changes to graph engine |
| `src/lib/diagram/*` | Layer 3 (DiagramService wraps it) | No changes to diagram engine |
| `src/lib/repo-editor/*` | Layer 3 (RepoService wraps it) | No changes to repo editor |
| `src/lib/git-intelligence/*` | Layer 3 (GitService wraps it) | No changes to git intelligence |
| `src/lib/terminal/*` | Layer 3 (TerminalService wraps it) | No changes to terminal |
| `src/lib/ai-client.ts` | Layer 3 (AIInsightService wraps it) | No changes to AI client |
| `src/lib/analysis-manifest.ts` | UI (existing) + Layer 0 (SPM builder reads report) | Bridge between old and new |
| `src/lib/agents/*` (existing 10 agents) | Layer 8 (converted to Skills) | Refactored, not deleted |

### 4.3 Enforcement

- **ESLint rule** (custom): `no-restricted-imports` per layer. Configured in `eslint.config.mjs`.
- **TypeScript paths**: `@/lib/agent/contracts` for types. Implementation paths: `@/lib/agent/spm`, `@/lib/agent/indexes`, etc.
- **Dependency-cruiser** (optional, future): automated dependency graph validation in CI.

---

## 5. Folder Structure (FROZEN)

```
src/lib/agent/
├── contracts/                    ← Phase 0 (DONE) — interfaces only
│   └── index.ts
│
├── spm/                          ← Layer 0: Semantic Project Model
│   ├── types.ts                  ← SPM interfaces (re-export from contracts)
│   ├── builder.ts                ← buildSPM(analysisReport): SemanticProjectModel
│   ├── serializer.ts             ← serialize/deserialize SPM (for caching)
│   └── index.ts
│
├── indexes/                      ← Layer 1: Index System
│   ├── symbol-index.ts           ← byName, byId, byFile, byKind
│   ├── reference-index.ts        ← referencesTo, referencesFrom
│   ├── call-index.ts             ← callers, callees, callChain
│   ├── import-index.ts           ← importsByFile, importedByFile, importChain
│   ├── issue-index.ts            ← byFile, byCategory, bySeverity, bySymbol
│   ├── path-index.ts             ← shortestPath, allPaths, cyclicDependencies
│   ├── index-builder.ts          ← buildIndexes(spm): IndexSystem
│   └── index.ts
│
├── query/                        ← Layer 2: Semantic Query Service
│   ├── query-service.ts          ← implements SemanticQueryService
│   └── index.ts
│
├── services/                     ← Layer 3: Service Layer
│   ├── graph-service.ts          ← wraps existing Graph Engine
│   ├── diagram-service.ts        ← wraps existing Diagram Engine
│   ├── search-service.ts         ← wraps text search
│   ├── git-service.ts            ← wraps existing Git Intelligence
│   ├── repo-service.ts           ← wraps existing Repo Editor
│   ├── ai-insight-service.ts     ← wraps existing AI Client
│   └── index.ts
│
├── tools/                        ← Layer 4: Tool Registry + Capabilities
│   ├── tool-registry.ts          ← register, get, listByCapability
│   ├── capability-registry.ts    ← register, resolve, capabilitiesOf
│   ├── manifest.ts               ← ToolManifest type (re-export from contracts)
│   ├── definitions/              ← individual tool implementations
│   │   ├── search-code.ts
│   │   ├── find-symbol.ts
│   │   ├── find-references.ts
│   │   ├── find-call-chain.ts
│   │   ├── find-impact.ts
│   │   ├── open-file.ts
│   │   ├── find-dead-code.ts
│   │   ├── find-duplicates.ts
│   │   ├── find-issues.ts
│   │   ├── find-architecture.ts
│   │   ├── find-circular-deps.ts
│   │   ├── get-diagram.ts
│   │   ├── generate-patch.ts
│   │   ├── apply-patch.ts
│   │   ├── rollback-changes.ts
│   │   ├── run-lint.ts
│   │   ├── run-tests.ts
│   │   ├── git-diff.ts
│   │   ├── git-commit.ts
│   │   ├── git-push.ts
│   │   ├── git-history.ts
│   │   ├── git-revert.ts
│   │   └── ai-chat.ts
│   └── index.ts
│
├── context/                      ← Layer 5: Context Builder + Token Budget
│   ├── context-builder.ts
│   ├── token-budget.ts           ← estimate, allocate, canFit
│   ├── context-ranker.ts         ← priority-based ranking
│   ├── context-compressor.ts     ← trim low-priority, summarize
│   └── index.ts
│
├── planner/                      ← Layer 6: Planner
│   ├── planner.ts                ← plan(query, context): ExecutionPlan
│   ├── execution-graph.ts        ← DAG builder + topological sort
│   ├── execution-policy.ts       ← default + override policies
│   ├── plan-validator.ts         ← validate DAG (no cycles, all deps exist)
│   └── index.ts
│
├── runtime/                      ← Layer 7: Runtime + Memory + Permission
│   ├── runtime.ts                ← run(plan): AsyncGenerator<AgentEvent>
│   ├── event-bus.ts              ← emit, subscribe, subscribeType
│   ├── permission-gate.ts        ← check, request, respond
│   ├── checkpoint-manager.ts     ← save, load, list checkpoints
│   ├── rollback-manager.ts       ← track changes, rollback
│   ├── execution-engine.ts       ← DAG executor (parallel groups, deps)
│   └── index.ts
│
├── memory/                       ← Layer 7: Memory (4 layers, not 5)
│   ├── working-memory.ts         ← volatile, per-step focus + scratchpad
│   ├── task-memory.ts            ← current task state + checkpoints
│   ├── session-memory.ts         ← chat history + preferences
│   ├── project-memory.ts         ← cached SPM + indexes + query cache
│   ├── agent-memory.ts           ← facade combining all 4
│   └── index.ts
│
├── skills/                       ← Layer 8: Skill Registry
│   ├── skill-registry.ts         ← register, get, match (keyword routing)
│   ├── skill-types.ts            ← Skill, PlanTemplate
│   ├── definitions/              ← individual skills (converted from agents)
│   │   ├── bug-fix.ts            ← from BugFixerAgent
│   │   ├── security-audit.ts     ← from SecurityAgent
│   │   ├── refactor.ts           ← from RefactoringAgent
│   │   ├── test-gen.ts           ← from TestAgent
│   │   ├── docs.ts               ← from DocumentationAgent
│   │   ├── code-review.ts        ← from CodeReviewerAgent
│   │   ├── repo-analyze.ts       ← from RepositoryAnalystAgent
│   │   ├── devops.ts             ← from DevOpsAgent
│   │   ├── performance.ts        ← from PerformanceAgent
│   │   └── pr-generate.ts        ← from PRGenerator
│   └── index.ts
│
└── index.ts                      ← public API (re-exports)

src/components/views/
└── agent-chat-view.tsx           ← Layer 9: new UI (replaces chat-view.tsx)
    ├── plan-visualizer.tsx       ← DAG rendering
    ├── tool-call-card.tsx        ← per-tool execution display
    ├── permission-dialog.tsx     ← confirmation modal
    ├── diff-preview.tsx          ← patch diff viewer
    ├── memory-panel.tsx          ← working memory display
    └── streaming-output.tsx      ← SSE message stream
```

### 5.1 What stays unchanged

```
src/lib/graph/                    ← existing, wrapped by GraphService
src/lib/diagram/                  ← existing, wrapped by DiagramService
src/lib/repo-editor/              ← existing, wrapped by RepoService
src/lib/git-intelligence/         ← existing, wrapped by GitService
src/lib/terminal/                 ← existing, wrapped by TerminalService
src/lib/ai-client.ts              ← existing, wrapped by AIInsightService
src/lib/analyzers/                ← existing (250 rules)
src/lib/analysis-engine-v2.ts     ← existing
src/lib/repo-parser.ts            ← existing
src/lib/analysis-manifest.ts      ← existing
src/app/api/                      ← existing 47 routes (unchanged)
src/components/views/             ← existing 10 views (chat-view replaced eventually)
```

---

## 6. Interface Contracts Summary

> Full contracts already in `src/lib/agent/contracts/index.ts` (933 lines, 20 sections). Below is a summary of key contracts. **No changes from Phase 0** — these are frozen.

### 6.1 Result Model
```ts
type Result<T, E = AgentError> = { ok: true; value: T } | { ok: false; error: E };
```
Every operation returns `Result<T>`. Never throws (except programmer errors).

### 6.2 SPM (pure data, no methods)
```ts
interface SemanticProjectModel {
  readonly id, repoOwner, repoName, branch, commitSha, createdAt;
  readonly files: readonly SemanticFile[];
  readonly symbols: readonly SemanticSymbol[];
  readonly edges: readonly SemanticEdge[];
  readonly issues: readonly SemanticIssue[];
  readonly insights: readonly SemanticInsight[];
  readonly architecture: SemanticArchitecture;
  readonly metrics: SemanticMetrics;
  readonly schemaVersion: number;
}
```

### 6.3 Query Service (business logic)
```ts
interface SemanticQueryService {
  findSymbol(name): Result<SemanticSymbol[]>;
  findCallChain(entry, maxDepth?): Result<CallChainNode>;
  findImpact(symbolId): Result<ImpactReport>;
  searchCode(query, options?): Result<SemanticFile[]>;
  findIssues(filter): Result<SemanticIssue[]>;
  // ... 15 methods total
}
```

### 6.4 Tool Manifest
```ts
interface ToolManifest {
  name, description, capabilities: Capability[];
  cost: "cheap" | "medium" | "expensive";
  estimatedTimeMs, timeout, maxRetries: number;
  permission: "allow" | "prompt" | "deny";
  parallel, parallelSafe, cacheable, streamable: boolean;
  cacheTtl: number;
  confidence: number;  // 0.0-1.0
  inputSchema, outputSchema: JSONSchema;
}
```

### 6.5 Execution Plan (DAG + Policy)
```ts
interface ExecutionPlan {
  graph: ExecutionGraph;    // DAG
  policy: ExecutionPolicy;  // global rules
}

interface ExecutionPolicy {
  maxParallel: number;           // default 3
  defaultTimeout: number;        // ms
  defaultRetries: number;
  tokenBudget: TokenBudget;
  continueOnFailure: boolean;
  rollbackOnFailure: boolean;
  requireConfirmationFor: PermissionLevel[];
}
```

### 6.6 Event Bus (8 core events, extensible)
```ts
type AgentEvent =
  | { type: "plan.generated"; plan: ExecutionPlan }
  | { type: "node.started"; nodeId: string; tool: string }
  | { type: "node.completed"; nodeId: string; result: unknown }
  | { type: "node.failed"; nodeId: string; error: AgentError }
  | { type: "permission.requested"; nodeId: string; tool: string; diff?: string }
  | { type: "task.completed"; summary: string }
  | { type: "task.failed"; error: AgentError }
  | { type: "task.cancelled"; reason: string };
  // + 10 more event types defined but optional initially
```

### 6.7 Memory (4 layers, not 5)
```ts
interface AgentMemory {
  working: WorkingMemory;    // volatile, per-step
  task: TaskMemory;          // per-task state + checkpoints
  session: SessionMemory;    // chat history + preferences
  project: ProjectMemory;    // cached SPM + indexes
  // Knowledge Memory: DEFERRED until real use case
}
```

---

## 7. Index System Design

| Index | Purpose | Data | Build | Complexity | Agent usage |
|-------|---------|------|-------|------------|-------------|
| **Symbol Index** | Find symbols by name/id/file/kind | `Map<name, Symbol[]>`, `Map<id, Symbol>`, `Map<file, Symbol[]>` | O(n) scan of `spm.symbols` | O(1) lookup | `findSymbol("handleLogin")` — Agent locates a function |
| **Reference Index** | Who calls/uses this symbol | `Map<symbolId, Edge[]>` (incoming + outgoing) | O(n) scan of `spm.edges` | O(1) lookup | `findReferences("AuthService.validate")` — Agent sees all callers |
| **Call Index** | Direct callers + callees + transitive chain | `Map<symbolId, Symbol[]>` (callers, callees) + BFS for chain | O(n) scan of edges where type="calls" | O(1) direct, O(V+E) chain | `findCallChain("handleLogin")` — Agent traces execution path |
| **Import Index** | File-level import graph | `Map<file, Edge[]>` (imports, importedBy) | O(n) scan of edges where type="imports" | O(1) direct, O(V+E) transitive | `importChain("auth/login.ts")` — Agent finds all files affected by changing login |
| **Issue Index** | Issues by file/category/severity/symbol | `Map<file, Issue[]>`, `Map<category, Issue[]>`, `Map<severity, Issue[]>` | O(n) scan of `spm.issues` | O(1) lookup | `findIssues({ file: "login.ts" })` — Agent gets all issues in a file |
| **Path Index** | Shortest path, all paths, cycles | Adjacency list + BFS + Tarjan | O(V+E) from import index | O(V+E) per query | `cyclicDependencies()` — Agent finds architecture problems |

**Build time:** All 6 indexes built in O(n) from SPM. Total build < 100ms for 500-file repo.

---

## 8. Capability Registry Design

### 8.1 Concept
Planner says "I need `find-symbol`". Runtime resolves to best tool. Decouples Planner from Tool implementation.

### 8.2 Capability → Tool mapping (initial 1:1)

| Capability | Tool | Permission | Notes |
|-----------|------|------------|-------|
| find-symbol | find-symbol | allow | Read-only |
| find-references | find-references | allow | Read-only |
| find-call-chain | find-call-chain | allow | Read-only |
| find-impact | find-impact | allow | Read-only |
| search-code | search-code | allow | Read-only |
| open-file | open-file | allow | Read-only |
| find-dead-code | find-dead-code | allow | Read-only |
| find-duplicates | find-duplicates | allow | Read-only |
| find-issues | find-issues | allow | Read-only |
| find-architecture | find-architecture | allow | Read-only |
| find-circular-deps | find-circular-deps | allow | Read-only |
| get-diagram | get-diagram | allow | Read-only |
| generate-patch | generate-patch | allow | No file changes (AI output only) |
| apply-patch | apply-patch | **prompt** | Modifies files |
| rollback-changes | rollback-changes | **prompt** | Modifies files |
| run-lint | run-lint | allow | No file changes |
| run-tests | run-tests | allow | No file changes |
| git-diff | git-diff | allow | Read-only |
| git-commit | git-commit | **prompt** | Modifies git state |
| git-push | git-push | **prompt** | Modifies remote |
| git-history | git-history | allow | Read-only |
| git-revert | git-revert | **prompt** | Modifies git state |
| ai-insight | ai-insight | allow | AI call, no side effects |
| ai-chat | ai-chat | allow | AI call, no side effects |

### 8.3 Multi-tool capability (future)
When ≥2 tools fulfill the same capability:
```
Capability: "search-code"
  ├─ Tool: "search-code-lexical" (confidence: 0.7, cost: cheap)
  └─ Tool: "search-code-semantic" (confidence: 0.9, cost: medium)
```
Runtime picks based on: confidence × cost × availability. Not needed initially.

---

## 9. Tool Manifest — Full Schema

```ts
interface ToolManifest {
  // Identity
  name: string;                          // "find-call-chain"
  description: string;                   // for LLM tool-use prompt
  capabilities: Capability[];            // ["find-call-chain"]

  // Cost model (Planner optimization)
  cost: "cheap" | "medium" | "expensive";
  estimatedTimeMs: number;               // p50 latency

  // Execution constraints
  permission: PermissionLevel;           // "allow" | "prompt" | "deny"
  timeout: number;                       // hard cap in ms
  maxRetries: number;                    // on transient failure

  // Parallelism
  parallel: boolean;                     // multiple instances simultaneously?
  parallelSafe: boolean;                 // safe alongside other tools?

  // Caching
  cacheable: boolean;
  cacheTtl: number;                      // ms (0 = no expiry)

  // Streaming
  streamable: boolean;                   // partial output via AsyncGenerator?

  // Reliability
  confidence: number;                    // 0.0-1.0 (default 1.0)

  // Schema (JSON Schema for validation)
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}
```

**No additional fields needed.** This covers all use cases identified.

---

## 10. Planner Design

### 10.1 Input
```ts
Planner.plan(query: string, context: AgentContext): Promise<Result<ExecutionPlan>>
```

### 10.2 Output: Execution Graph (DAG) + Policy

```ts
interface ExecutionGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];         // dependency edges
  entryPoints: string[];     // nodes with no dependencies
}

interface PlanNode {
  id: string;
  step: string;              // "Find call chain for handleLogin"
  capability: Capability;    // "find-call-chain"
  toolName?: string;         // resolved by Runtime (or specified by Planner)
  params: Record<string, unknown>;
  dependsOn: string[];       // node IDs
  parallelGroup?: string;    // "discover" | "verify" | null
  nodePolicy?: Partial<ExecutionPolicy>;  // override
  status: "pending" | "running" | "awaiting-permission" | "done" | "failed" | "skipped" | "cancelled";
  result?: unknown;
  error?: AgentError;
}
```

### 10.3 DAG example
```
Parallel group "discover":
  [A: searchCode("login")]     ─┐
  [B: findIssues("login.ts")]  ─┤
                                │
Sequential:                     │
  [C: findCallChain("handleLogin")] ← depends A
  [D: findImpact("AuthService")]    ← depends C
  [E: generatePatch]                ← depends B, D, permission: prompt
  [F: applyPatch]                   ← depends E, permission: prompt

Parallel group "verify":
  [G: runLint]    ← depends F
  [H: runTests]   ← depends F
```

### 10.4 Planner implementation
- LLM generates a JSON plan matching `ExecutionPlan` schema
- `PlanValidator` checks: no cycles, all `dependsOn` exist, capabilities are registered
- If invalid → retry with error feedback (max 2 retries)

---

## 11. Context Builder Design

### 11.1 Pipeline
```
Planner says: "Step E needs context from steps A, B, C, D"
  │
  ▼
1. Collect results from A, B, C, D
  │
  ▼
2. Token Budget Manager estimates each piece
   - File content (A): 500 tokens
   - Issues (B): 200 tokens
   - Call chain (C): 300 tokens
   - Impact report (D): 400 tokens
   Total: 1400 tokens (within 120K budget)
  │
  ▼
3. Context Ranker assigns priority
   - Critical: file content, issues
   - Important: call chain, impact
   - Nice-to-have: related files, metrics
  │
  ▼
4. If overflow → Context Compressor trims:
   - Drop nice-to-have first
   - Summarize important (truncate, extract key points)
   - Never drop critical
  │
  ▼
5. Context Deduplication
   - If same symbol appears in call chain + impact → dedupe
  │
  ▼
6. Final: AgentContextPayload { content, tokens, allocations }
```

### 11.2 Token Budget
```ts
interface TokenBudget {
  total: number;        // model limit (128000 for gpt-4.1-mini)
  reserved: number;     // for response (8000)
  available: number;    // 120000
}
```
Estimate: ~4 chars = 1 token. Conservative.

---

## 12. Runtime Design

### 12.1 Core API
```ts
interface AgentRuntime {
  run(plan: ExecutionPlan, context: AgentContext): AsyncGenerator<AgentEvent>;
  cancel(taskId: string): void;
  pause(taskId: string): void;
  resume(taskId: string): AsyncGenerator<AgentEvent>;
}
```

### 12.2 Execution Engine
- **Topological sort** of DAG nodes
- **Parallel groups**: nodes in same `parallelGroup` run concurrently (up to `maxParallel`)
- **Dependency wait**: node starts only when all `dependsOn` are `done`
- **Permission gate**: before `prompt`-level tools, emit `permission.requested`, wait for response
- **Timeout**: kill node if exceeds `timeout` ms
- **Retry**: on transient failure (`error.recoverable === true`), retry up to `maxRetries`
- **Rollback**: if `rollbackOnFailure` and a write tool fails, rollback all prior writes in this plan

### 12.3 Checkpoint
- After each node completes, save checkpoint: `{ plan, completedNodeIds, currentNodeId, memory }`
- On resume: load checkpoint, skip completed nodes, continue from current

### 12.4 Event Bus
- `emit(event)` → all subscribers notified
- UI subscribes to render progress
- Logger subscribes to write logs
- Metrics subscribes to record timings

---

## 13. Memory Design (4 layers)

| Layer | Lifetime | Storage | Purpose | Example |
|-------|----------|---------|---------|---------|
| **Working** | Per-step (volatile) | In-memory | Current focus, hypothesis, scratchpad | `currentFile: "login.ts"`, `currentBug: issue`, `scratchpad: ["Found N+1 query"]` |
| **Task** | Per-task | sessionStorage | Plan state, checkpoints, execution log | `{ taskId, plan, checkpoints: [...], log: [...] }` |
| **Session** | Per-session | sessionStorage | Chat history, user preferences | `{ messages: [...], locale: "vi", autoApproveReadTools: true }` |
| **Project** | Per-project (in-memory) | In-memory | Cached SPM, indexes, query results | `{ spm, indexes, graphCache: Map, diagramCache: Map }` |

### Why NOT 5 layers?
The proposed **Knowledge Memory** (persistent, cross-session learned patterns) is valuable but:
- No current use case requires it
- Adds persistence complexity (DB schema, migration)
- Can be added later without breaking architecture

**Decision: 4 layers now. Knowledge Memory deferred to Phase 12 (future).**

---

## 14. UI Design (Agent Chat View)

### 14.1 Layout
```
┌──────────────────────────────────────────────────────┐
│ Agent Chat                                    [Cancel]│
├─────────────────────┬────────────────────────────────┤
│                     │                                │
│  Message Stream     │  Execution Panel               │
│  (left, 60%)        │  (right, 40%)                  │
│                     │                                │
│  ┌─────────────┐    │  ┌──────────────────────────┐  │
│  │ 👤 User:    │    │  │ Execution Graph (DAG)    │  │
│  │ Fix bug     │    │  │                          │  │
│  │ login chậm  │    │  │  ●──→●──→●               │  │
│  └─────────────┘    │  │       \                  │  │
│                     │  │        ●──→●              │  │
│  ┌─────────────┐    │  │                          │  │
│  │ 🤖 Agent:   │    │  │ Status: ● done           │  │
│  │ Planning... │    │  │        ● running         │  │
│  └─────────────┘    │  │        ○ pending         │  │
│                     │  └──────────────────────────┘  │
│  ┌─────────────┐    │                                │
│  │ 🔧 Tool:    │    │  ┌──────────────────────────┐  │
│  │ searchCode  │    │  │ Working Memory           │  │
│  │ ✓ 3 results │    │  │                          │  │
│  └─────────────┘    │  │ Current file: login.ts   │  │
│                     │  │ Current bug: N+1 query   │  │
│  ┌─────────────┐    │  │ Hypothesis: DB query     │  │
│  │ ⚠️ Apply    │    │  │   takes 2.3s             │  │
│  │ patch?      │    │  │                          │  │
│  │ [Approve]   │    │  │ Scratchpad:              │  │
│  │ [Reject]    │    │  │ - 3 callers found        │  │
│  └─────────────┘    │  │ - Auth impact: high      │  │
│                     │  └──────────────────────────┘  │
│  [Input box...]     │                                │
│                     │                                │
└─────────────────────┴────────────────────────────────┘
```

### 14.2 Components

| Component | Purpose |
|-----------|---------|
| `MessageStream` | Chat messages (user + agent + tool results) with streaming |
| `PlanVisualizer` | DAG rendering with node status (pending/running/done/failed) |
| `ToolCallCard` | Per-tool: name, params, result, duration, status |
| `PermissionDialog` | Modal with diff preview + Approve/Reject buttons |
| `DiffPreview` | Syntax-highlighted diff before applying patch |
| `WorkingMemoryPanel` | Shows current focus, hypothesis, scratchpad |
| `ProgressIndicator` | Overall progress bar (X/Y nodes complete) |
| `CancelButton` | Cancels running task |

### 14.3 Interaction flow
1. User types query in input box
2. `SkillRegistry.match(query)` auto-selects skill
3. `Planner.plan(query)` generates DAG → `plan.generated` event → PlanVisualizer renders
4. Runtime starts executing → `node.started` events → nodes turn blue
5. `node.completed` events → nodes turn green, results appear in ToolCallCard
6. `permission.requested` event → PermissionDialog modal with diff
7. User clicks Approve → `permission.granted` → node continues
8. `task.completed` → summary message in stream

---

## 15. Phase 0 — Architecture Validation (DONE)

Phase 0 is complete. Deliverables:
- ✅ `src/lib/agent/contracts/index.ts` (933 lines, 20 sections)
- ✅ `ARCHITECTURE.md` (this document, supersedes previous version)
- ✅ Dependency rules defined
- ✅ Folder structure defined
- ✅ Error codes canonicalized
- ✅ Event naming convention defined

**Phase 0 is FROZEN.** Changes require version bump (1.0.0 → 2.0.0).

---

## 16. Master Roadmap

### Phase 1: Semantic Project Model (Layer 0)

| Attribute | Value |
|-----------|-------|
| **Goal** | Build SPM from existing AnalysisReport. SPM is pure data, queryable by upper layers. |
| **Input** | `AnalysisReport` (existing type from `src/lib/types.ts`) |
| **Output** | `src/lib/agent/spm/builder.ts` — `buildSPM(report): SemanticProjectModel` |
| **Dependencies** | Phase 0 (contracts) |
| **Est. time** | 4 days |
| **Risk** | SPM schema mismatch with existing Graph/Diagram engines. **Mitigation:** SPM builder reads from report, engines continue to read from report. No engine changes. |
| **Completion criteria** | SPM builds from any existing AnalysisReport. All 250 issues + all symbols + all edges mapped. |
| **Test criteria** | Unit test: build SPM from sample report, verify file/symbol/edge/issue counts match. |

### Phase 2: Index System (Layer 1)

| Attribute | Value |
|-----------|-------|
| **Goal** | 6 indexes for O(1) lookups. |
| **Input** | `SemanticProjectModel` |
| **Output** | `src/lib/agent/indexes/` — 6 index files + `index-builder.ts` |
| **Dependencies** | Phase 1 |
| **Est. time** | 3 days |
| **Risk** | Index build performance on large repos (>500 files). **Mitigation:** O(n) build, benchmark on 500-file repo, target <100ms. |
| **Completion criteria** | All 6 indexes build from SPM. O(1) lookups verified. |
| **Test criteria** | Unit test: build indexes, verify `findSymbol("handleLogin")` returns correct symbol in <1ms. |

### Phase 3: Semantic Query Service (Layer 2)

| Attribute | Value |
|-----------|-------|
| **Goal** | Business logic queries on top of SPM + Indexes. |
| **Input** | SPM + IndexSystem |
| **Output** | `src/lib/agent/query/query-service.ts` |
| **Dependencies** | Phase 1, 2 |
| **Est. time** | 2 days |
| **Risk** | Low — straightforward composition of indexes. |
| **Completion criteria** | 15 query methods implemented, all return `Result<T>`. |
| **Test criteria** | Unit test: each query method returns expected results. |

### Phase 4: Service Layer (Layer 3)

| Attribute | Value |
|-----------|-------|
| **Goal** | Wrap existing engines (Graph, Diagram, Git, Repo, Terminal, AI) in services. |
| **Input** | Existing engine modules + SPM |
| **Output** | `src/lib/agent/services/` — 6 service files |
| **Dependencies** | Phase 3 |
| **Est. time** | 3 days |
| **Risk** | Existing engines expect `AnalysisReport`, not SPM. **Mitigation:** Services accept SPM, internally convert to report format for engine calls. Or: engines read from SPM directly (preferred, but requires engine refactor — defer). |
| **Completion criteria** | All 6 services wrap existing engines without modifying engine source. |
| **Test criteria** | Integration test: GraphService.buildGraph(spm) produces same GraphData as existing graph engine. |

### Phase 5: Tool Registry + Capability Registry (Layer 4)

| Attribute | Value |
|-----------|-------|
| **Goal** | Register 20+ tools with manifests. Map capabilities to tools. |
| **Input** | Service Layer |
| **Output** | `src/lib/agent/tools/` — registry + 20 tool definitions |
| **Dependencies** | Phase 4 |
| **Est. time** | 3 days |
| **Risk** | Tool manifest schema too rigid. **Mitigation:** Start with 1:1 capability→tool mapping, expand later. |
| **Completion criteria** | 20 tools registered with full manifests. `CapabilityRegistry.resolve("find-symbol")` returns "find-symbol" tool. |
| **Test criteria** | Unit test: execute each tool with sample params, verify result. |

### Phase 6: Context Builder + Token Budget (Layer 5)

| Attribute | Value |
|-----------|-------|
| **Goal** | Assemble LLM context within token budget. |
| **Input** | Query Service + Tool results |
| **Output** | `src/lib/agent/context/` — builder + budget + ranker + compressor |
| **Dependencies** | Phase 3, 5 |
| **Est. time** | 3 days |
| **Risk** | Token estimation inaccurate. **Mitigation:** Use conservative 4 chars/token ratio, calibrate later. |
| **Completion criteria** | Context builder assembles context from 4+ tool results, fits within 120K token budget, trims low-priority on overflow. |
| **Test criteria** | Unit test: 200K tokens of input → trimmed to 120K, critical content preserved. |

### Phase 7: Planner (Layer 6)

| Attribute | Value |
|-----------|-------|
| **Goal** | LLM generates ExecutionPlan (DAG + Policy) from user query. |
| **Input** | User query + AgentContext |
| **Output** | `src/lib/agent/planner/` — planner + graph builder + validator |
| **Dependencies** | Phase 5, 6 |
| **Est. time** | 4 days |
| **Risk** | LLM generates invalid DAG (cycles, missing deps). **Mitigation:** PlanValidator + retry with error feedback. |
| **Completion criteria** | Planner generates valid DAG for 5 sample queries (fix bug, add test, refactor, security audit, explain code). |
| **Test criteria** | Unit test: validate DAG (no cycles, all deps exist), retry on invalid. |

### Phase 8: Agent Runtime (Layer 7)

| Attribute | Value |
|-----------|-------|
| **Goal** | Event-driven DAG executor with pause/resume/cancel/rollback. |
| **Input** | ExecutionPlan + AgentContext |
| **Output** | `src/lib/agent/runtime/` — runtime + event bus + permission gate + checkpoint + rollback |
| **Dependencies** | Phase 5, 7 |
| **Est. time** | 4 days |
| **Risk** | Concurrent execution bugs. **Mitigation:** Start with maxParallel=1 (sequential), increase to 3 after testing. |
| **Completion criteria** | Runtime executes DAG, emits events, handles permission requests, supports cancel. |
| **Test criteria** | Integration test: execute 5-node DAG, verify all events emitted in correct order. |

### Phase 9: Memory (Layer 7)

| Attribute | Value |
|-----------|-------|
| **Goal** | 4-layer memory (Working, Task, Session, Project). |
| **Input** | Runtime events |
| **Output** | `src/lib/agent/memory/` — 4 memory files + facade |
| **Dependencies** | Phase 8 |
| **Est. time** | 3 days |
| **Risk** | sessionStorage quota exceeded on large plans. **Mitigation:** Compress checkpoints, cap at 50 most recent. |
| **Completion criteria** | Working Memory updates on each node, Task Memory saves checkpoints, Session Memory persists chat, Project Memory caches SPM. |
| **Test criteria** | Unit test: pause task → resume → verify state restored. |

### Phase 10: Skill Registry (Layer 8)

| Attribute | Value |
|-----------|-------|
| **Goal** | Convert 10 existing agents to Skills. Auto-route by keywords. |
| **Input** | Existing 10 agent files + Tool Registry |
| **Output** | `src/lib/agent/skills/` — registry + 10 skill definitions |
| **Dependencies** | Phase 5, 8 |
| **Est. time** | 2 days |
| **Risk** | Existing agents have complex logic that doesn't fit Skill template. **Mitigation:** Skills wrap existing agent logic, don't rewrite. |
| **Completion criteria** | 10 skills registered. `match("fix bug login")` returns "bug-fix" skill. |
| **Test criteria** | Unit test: keyword matching for all 10 skills. |

### Phase 11: Streaming UI (Layer 9)

| Attribute | Value |
|-----------|-------|
| **Goal** | New Agent Chat view with DAG visualization, streaming, permission dialogs. |
| **Input** | Runtime + EventBus |
| **Output** | `src/components/views/agent-chat-view.tsx` + 6 sub-components |
| **Dependencies** | Phase 8, 10 |
| **Est. time** | 4 days |
| **Risk** | SSE streaming on Vercel serverless (10s limit). **Mitigation:** Use `/api/agents/execute` with chunked response, not true SSE. Or: Vercel Edge Runtime for streaming. |
| **Completion criteria** | User can submit query, see DAG, approve patches, see results — all in one UI. |
| **Test criteria** | E2E test: "fix typo" query → plan → execute → patch → approve → apply. |

### Phase 12: Multi-Agent + Knowledge Memory (Future)

| Attribute | Value |
|-----------|-------|
| **Goal** | Agent Manager coordinates multiple Skills. Knowledge Memory persists learned patterns. |
| **Dependencies** | All above |
| **Est. time** | Future |
| **Risk** | Scope creep. **Mitigation:** Defer until single-agent is stable. |

---

## 17. Readiness Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 9.5/10 | Clean layering, SSOT, plugin-friendly. Deduct 0.5 for potential Capability Registry over-abstraction (mitigated: 1:1 initial). |
| **Scalability** | 9/10 | DAG parallelism, token budget, caching. Deduct 1 for sessionStorage limits on large plans. |
| **Performance** | 9/10 | O(1) indexes, LRU caches, dynamic imports. |
| **Maintainability** | 9.5/10 | Clear layer deps, folder structure, contracts. |
| **Plugin Architecture** | 9/10 | Tool/Capability/Skill registries. AgentPlugin interface defined. |
| **AI Agent Readiness** | 9.5/10 | Planner + DAG + Context Budget + Memory + Permission Gate. Matches Cursor/Claude Code patterns. |
| **Enterprise Readiness** | 9/10 | Audit log, rate limiting, token budget, policy engine, multi-tenant. Deduct 1 for no RBAC on agent tools (future). |
| **Backward Compatibility** | 10/10 | Zero changes to existing engines, API routes, UI views. Agent system built alongside. |
| **Overall** | **9.4/10** | Production-ready architecture. Ready for implementation. |

---

## 18. Approval Gate

**This document is FROZEN.** 

No implementation begins until the user explicitly says:
> "Bắt đầu Phase 0" (Phase 0 is already done — this means "Bắt đầu Phase 1")

or

> "Approved — begin implementation"

Once approved, phases proceed sequentially (1 → 2 → ... → 11). Each phase has explicit completion criteria and must pass tests before the next phase begins.

**Changes to this document after approval require a version bump** (1.0.0 → 1.1.0 for minor, 2.0.0 for major).

---

## 19. Appendix — What This Document Does NOT Include

- Implementation code (by design)
- Database schema changes (none needed — existing 18 Prisma models suffice)
- API route changes (existing 47 routes unchanged; new `/api/agent/run` route added in Phase 11)
- UI route changes (existing `/` route unchanged; `chat-view.tsx` eventually replaced by `agent-chat-view.tsx`)
- Deployment changes (Vercel config unchanged)
- Environment variable changes (none needed)
- Package dependencies (no new packages required for Phases 1-10; Phase 11 may add a DAG visualization library)
