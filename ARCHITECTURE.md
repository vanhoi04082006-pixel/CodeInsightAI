# CodeInsight AI — Agent Architecture (Phase 0: Contracts)

> **Status: FROZEN** — All interfaces defined. Implementation phases 1-10 build against these contracts.

## Table of Contents
1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Layer Dependencies](#layer-dependencies)
4. [20 Contract Sections](#20-contract-sections)
5. [Implementation Phases](#implementation-phases)
6. [Migration Strategy](#migration-strategy)

---

## Overview

CodeInsight AI Agent is a **Coding Agent** (not read-only) with:
- **Semantic Project Model** as Single Source of Truth (SSOT)
- **Event-Driven Runtime** with DAG execution
- **3-level Permission Gate** (allow / prompt / deny)
- **5-layer Memory** (Working → Task → Session → Project → Knowledge)
- **Tool Registry** with Manifest (cost, timeout, confidence, cacheable)
- **Capability Registry** (abstract — Planner says "I need X", Runtime picks tool)
- **Token Budget Manager** (prevents context overflow)
- **Skill Registry** (10 specialized agents → skills, not separate Agent classes)

---

## Architecture Diagram

```
Parser
      │
      ▼
Semantic Project Model (pure data — no logic)
      │
      ▼
Semantic Query Service (business logic)
      │
 ┌────┴──────────────┐
 ▼                   ▼
Index System       Cache Layer
 ├ Symbol Index    ├ LRU Cache
 ├ Reference Index ├ Query Cache
 ├ Call Index      └ Result Cache
 ├ Import Index
 ├ Issue Index
 └ Path Index
           │
           ▼
      Service Layer
 ├ GraphService    ├ DiagramService
 ├ SearchService   ├ GitService
 ├ RepoService     └ AIInsightService
           │
           ▼
   Capability Registry (abstract)
           │
           ▼
   Tool Registry + Manifest (concrete)
           │
           ▼
   Context Builder + Token Budget
           │
           ▼
   Planner → Execution Graph (DAG) + Policy
           │
           ▼
   Agent Runtime (Event-Driven + Event Bus)
   ├ Permission Gate
   ├ Checkpoint Manager
   └ Rollback Manager
           │
    ┌──────┴──────┐
    ▼             ▼
 Working Memory  Long Memory
    │       ├ Task Memory
    │       ├ Session Memory
    │       ├ Project Memory
    │       └ Knowledge Memory
    └──────┬──────┘
           ▼
   Streaming UI (subscribes Event Bus)
```

---

## Layer Dependencies

**Rule: A layer may only depend on layers BELOW it (never above).**

| Layer | Component | Can depend on |
|-------|-----------|---------------|
| 0 | Semantic Project Model | (none — pure data) |
| 1 | Index System | Layer 0 (SPM types) |
| 2 | Semantic Query Service | Layer 0, 1 |
| 3 | Service Layer | Layer 2 + existing engines (graph, diagram, etc.) |
| 4 | Tool Registry + Capability Registry | Layer 3 |
| 5 | Context Builder + Token Budget | Layer 2, 4 |
| 6 | Planner | Layer 4, 5 |
| 7 | Runtime + Memory + Permission | Layer 4, 6 |
| 8 | Skill Registry | Layer 4, 7 |
| 9 | UI | Layer 7, 8 |

**VIOLATION examples (must NOT happen):**
- SPM importing from Service Layer → circular dependency
- Tool importing from Planner → layer inversion
- Runtime importing from UI → inversion of control

---

## 20 Contract Sections

All contracts are defined in: `src/lib/agent/contracts/index.ts`

| # | Section | Purpose |
|---|---------|---------|
| 1 | Result Model | `Result<T, E>` — never throw, always return |
| 2 | Semantic Project Model | Pure data (files, symbols, edges, issues, insights) |
| 3 | Index System | O(1) lookups: Symbol, Reference, Call, Import, Issue, Path |
| 4 | Semantic Query Service | Business logic (findSymbol, findImpact, searchCode, etc.) |
| 5 | Service Layer | GraphService, DiagramService, GitService, RepoService, etc. |
| 6 | Capability Registry | Abstract ("I need find-symbol") → resolves to concrete tool |
| 7 | Tool Registry + Manifest | Concrete tools with cost, timeout, confidence, cacheable |
| 8 | Context Builder + Token Budget | Assemble LLM context within token budget |
| 9 | Planner | Generates Execution Graph (DAG) + Execution Policy |
| 10 | Agent Runtime | Event-Driven execution with pause/resume/cancel/rollback |
| 11 | Memory (5 layers) | Working → Task → Session → Project → Knowledge |
| 12 | Skill Registry | 10 agents → skills (systemPrompt + capabilities + triggerKeywords) |
| 13 | Permission Gate | allow / prompt / deny + UI confirmation |
| 14 | Dependency Rules | Layer can only depend on lower layers |
| 15 | Folder Structure | `src/lib/agent/` with subdirectories per layer |
| 16 | Error Codes | Canonical list (TOOL_TIMEOUT, PERMISSION_DENIED, etc.) |
| 17 | Event Naming | `{scope}.{action}` kebab-case, past tense |
| 18 | Logging Convention | LogEntry with level, module, message, taskId, nodeId |
| 19 | Metrics Convention | MetricEntry with name, value, unit, tags |
| 20 | Plugin Convention | AgentPlugin interface for extensibility |

---

## Implementation Phases

| Phase | Component | Layer | Est. Days | Depends on |
|-------|-----------|-------|-----------|------------|
| **0** | Architecture Validation & Contracts | All | ✅ DONE | — |
| **1** | Semantic Project Model (SSOT) + Builder | 0 | 4 | Phase 0 |
| **2** | Index System (6 indexes) | 1 | 3 | Phase 1 |
| **3** | Semantic Query Service | 2 | 2 | Phase 1, 2 |
| **4** | Service Layer (6 services) | 3 | 3 | Phase 3 |
| **5** | Tool Registry + Manifest + Capability Registry | 4 | 3 | Phase 4 |
| **6** | Context Builder + Token Budget | 5 | 3 | Phase 3, 5 |
| **7** | Planner (Execution Graph DAG + Policy) | 6 | 4 | Phase 5, 6 |
| **8** | Agent Runtime (Event-Driven + Event Bus) | 7 | 4 | Phase 5, 7 |
| **9** | Memory (5 layers) | 7 | 3 | Phase 8 |
| **10** | Skill Registry (convert 10 agents → skills) | 8 | 2 | Phase 5, 8 |
| **11** | Streaming UI (Event Bus subscriber) | 9 | 4 | Phase 8, 10 |
| **12** | Multi-Agent coordination | Future | — | All |

**Total: ~35 days** (can parallelize some phases)

---

## Migration Strategy

### Principle: Backward Compatible
- Existing code continues to work during migration
- New Agent system is built alongside, not replacing
- Consumers migrate gradually from `AnalysisReport` → `SemanticProjectModel`

### Steps:
1. **Phase 1-3**: Build SPM + Indexes + Query Service (reads from existing AnalysisReport)
2. **Phase 4**: Services wrap existing engines (Graph Engine, Diagram Engine, etc.)
3. **Phase 5-8**: Build Tool/Capability/Planner/Runtime (new code, no impact on existing)
4. **Phase 10**: Convert 10 existing agents → Skills (refactor, not rewrite)
5. **Phase 11**: New Agent Chat UI replaces existing chat-view.tsx
6. **Final**: AnalysisReport becomes transport layer (serialized SPM)

### What does NOT change:
- Existing API routes (`/api/analyze`, `/api/chat`, etc.)
- Existing UI components (dashboard, project-view, etc.)
- Existing analyzers (250 rules)
- Existing Graph/Diagram engines (wrapped by Services)
- Existing Prisma schema

### What DOES change:
- `chat-view.tsx` → Agent Chat (streaming, DAG, permissions)
- Agent execution: manual selection → Planner auto-routes
- Context: each agent fetches own → Context Builder centralizes

---

## Key Design Decisions

### 1. SPM is pure data (no methods)
**Decision:** SPM contains only data fields. Query logic lives in SemanticQueryService.
**Rationale:** Testable, cacheable, swappable implementations. SPM stays small.

### 2. Capability Registry > Tool Registry
**Decision:** Planner says "I need find-symbol", Runtime resolves to best tool.
**Rationale:** Multiple tools can fulfill same capability (Graph Tool vs Search Tool for find-symbol). Planner doesn't need to know which.

### 3. Execution Graph is DAG (not Step[])
**Decision:** Planner generates DAG with parallel groups.
**Rationale:** Independent steps (findSecurity + findPerformance) run in parallel → faster.

### 4. Token Budget per context build
**Decision:** Context Builder estimates tokens, trims low-priority if overflow.
**Rationale:** Prevents context overflow (128K model limit). Cursor/Claude Code both have this.

### 5. 5-layer Memory
**Decision:** Working (volatile) → Task (per-task) → Session (per-session) → Project (cached SPM) → Knowledge (persistent).
**Rationale:** Different lifetimes, different storage. Working Memory is the "scratchpad" Planner uses continuously.

### 6. Event-Driven Runtime
**Decision:** Runtime emits events, UI subscribes via EventBus.
**Rationale:** Clean separation. UI doesn't poll. Easy to add metrics/logging subscribers.

### 7. Tool Manifest with confidence
**Decision:** Each tool has `confidence: number` (0.0-1.0).
**Rationale:** Planner can choose more reliable tool. Useful when multiple providers (OpenAI, Anthropic, GLM).

### 8. Skills (not Agents)
**Decision:** 10 existing agents become Skills (systemPrompt + capabilities).
**Rationale:** One Agent Runtime + many Skills is simpler than 10 Agent classes. Skills share Runtime, Memory, Tools.
