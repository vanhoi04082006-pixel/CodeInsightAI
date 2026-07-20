<div align="center">

# 🧠 CodeInsight AI

### Autonomous AI Software Engineering Platform

**Paste a GitHub Repository. AI Understands Everything. Then Plans, Codes, Tests, Fixes, Commits, and Pushes — Autonomously.**

Local-first AI development platform with 11 collaborating agents that analyze, edit, test, and ship code without step-by-step human guidance.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![d3-force](https://img.shields.io/badge/d3--force-3-22d3ee)
![License](https://img.shields.io/badge/License-MIT-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Capabilities](#-key-capabilities)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Multi-Agent System](#-multi-agent-system)
- [Autonomous Workflow](#-autonomous-workflow)
- [Static Analyzers](#-static-analyzers)
- [AI Providers](#-ai-providers)
- [Plugin SDK](#-plugin-sdk)
- [Production Hardening](#-production-hardening)
- [Internationalization](#-internationalization)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Privacy](#-privacy)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**CodeInsight AI** is not just a chat + analyzer. It's a full **AI Software Engineering Platform** where 11 specialized agents collaborate to:

1. **Analyze** any GitHub repository (public + private via OAuth)
2. **Plan** implementation tasks with dependency graphs
3. **Edit** code (file CRUD, import updates, refactoring)
4. **Test** — generate tests, run them, read failures, fix, retry until pass
5. **Fix bugs** — read stack traces, propose patches, verify with tsc + lint
6. **Review code** like a Senior Engineer (score + comments)
7. **Generate docs** — README, API, architecture, deployment guides
8. **Commit + push** with AI-generated conventional commit messages
9. **Generate PRs** with title, breaking changes, migration guide, checklist
10. **Deploy** — Docker, K8s, CI/CD, Vercel/Railway/Render/Fly configs

All **local-first**: your keys, your data, your models. No subscriptions, no billing.

---

## ✨ Key Capabilities

### 🤖 Multi-Agent System (11 Agents)

| Agent | Role | What It Does |
|-------|------|--------------|
| **Orchestrator** | Coordinator | Receives goals, calls Planner, schedules execution graph |
| **Planner** | Strategist | Breaks goals into tasks with dependency graph + difficulty estimates |
| **Repository Analyst** | Codebase Expert | Fetches + parses repos, builds dependency graphs, runs analyzers |
| **Code Reviewer** | Senior Engineer | Reviews readability, architecture, naming, perf, security — scores 0-100 |
| **Bug Fixer** | Debugger | Reads stack traces, proposes patches, verifies with tsc + lint, retries |
| **Test Agent** | QA Engineer | Generates unit/integration/e2e tests, runs them, fixes failures, retries |
| **Refactoring Agent** | Code Cleaner | Extracts functions, simplifies conditionals, renames, updates imports |
| **Documentation Agent** | Tech Writer | Generates README, API docs, architecture docs, folder guides |
| **Security Agent** | Security Auditor | 13-rule static analysis + AI deep review with CWE classification |
| **Performance Agent** | Perf Optimizer | 42-rule analysis + AI prioritized optimizations |
| **DevOps Agent** | DevOps Engineer | Docker, Compose, Nginx, GitHub Actions, K8s, deploy configs |

Agents communicate via **event bus** + **message bus**, share **context** + **repository memory**, and execute in **parallel** with dependency ordering.

### 🧠 Autonomous Workflow

```
User Goal ("Add Google Login")
        ↓
   Planner Agent
   ├── Analyze project structure
   ├── Create task breakdown
   └── Build Execution Graph
        ↓
   Scheduler (parallel execution)
   ├── Repository Analyst → analyze
   ├── Code Reviewer → review
   ├── Bug Fixer → fix issues
   ├── Documentation Agent → update docs
   └── Test Agent → generate + run tests
        ↓
   Write file changes to disk
        ↓
   Build Verification Loop (up to 3 rounds)
   ├── tsc --noEmit
   ├── bun run lint
   ├── bun test / vitest
   └── if fail → Bug Fixer → retry
        ↓
   Git Operations
   ├── Stage changes
   ├── AI commit message (conventional)
   ├── Commit
   └── Push to remote
        ↓
   Final Report (phases, build/test/lint, commit SHA, artifacts)
```

### 🔍 Deep Static Analysis (66 rules)

| Analyzer | Rules | Examples |
|----------|-------|----------|
| **Security** | 13 | Hardcoded secrets, SQL injection, XSS, weak hashing, path traversal |
| **Bugs** | 11 | Race conditions, null derefs, off-by-one, unchecked promises |
| **Performance** | 42 | Bundle bloat (lodash/moment/rxjs), memory leaks, React anti-patterns, N+1 queries, layout thrashing |
| **Architecture** | metrics | Robert C. Martin's Instability, Abstractness, Distance from Main Sequence, Fan-in/Fan-out, directory-level cycle detection |

### 🎨 Rich UI

- **Landing page** with 3D AI Core (React Three Fiber)
- **Dashboard** with health gauge + charts
- **9-tab Project Report** (Overview → Architecture → Bugs → Security → Performance → Dependencies → Code → Docs → Roadmap)
- **Interactive dependency graph** (d3-force layout)
- **Dynamic SVG diagrams** (UML, Sequence, ERD — auto-hidden when N/A)
- **AI Chat** with personality system + developer mode debug panel
- **AI Agents view** with 4 tabs:
  - **Dashboard** — 11 agents + queue stats + recent events
  - **Workflow Runner** — input goal → run autonomous → view phases + report
  - **Terminal** — sandboxed shell with permission system
  - **Git** — status, stage, AI commit, push, diff review
- **10 views total** (landing, dashboard, analyze, project, chat, history, providers, personalities, agents, settings)
- **Glassmorphism dark theme** + 9 accent colors + light mode
- **Personalization** — theme, accent, density, animation level, accessibility (color-blind modes)

### 🌐 i18n (English + Tiếng Việt)

- 13 namespaces × 2 languages = 26 locale files
- SSR-safe cookie-based (no hydration mismatch)
- AI responds in selected language

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                          │
│  Landing · Dashboard · Analyze · Project · Chat             │
│  History · Providers · Personalities · Agents · Settings    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      API Routes (18)                        │
│  /api/analyze · /api/chat · /api/agents/* · /api/workflow/* │
│  /api/terminal/* · /api/git/* · /api/auth/* · /api/report   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Autonomous Workflow                       │
│  runAutonomousWorkflow() · pairProgram() · runSingleTask()  │
│  Planner → Scheduler → Build/Test/Lint → Commit → Push      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                 Multi-Agent System (11)                      │
│  Orchestrator · Planner · Repo Analyst · Code Reviewer      │
│  Bug Fixer · Refactoring · Docs · Test · Security           │
│  Performance · DevOps                                      │
│                                                             │
│  Event Bus · Task Queue · Shared Context · Message Bus      │
│  Repository Memory · Retry Policy · AI Client               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Supporting Modules                       │
│  Repo Editor (CRUD + diff + undo/redo)                      │
│  AI Terminal (sandbox + permissions + history)              │
│  Git Intelligence (20 ops + AI commit + changelog)          │
│  Knowledge Base (semantic memory + Prisma persist)          │
│  Plugin SDK (12 manifests + 5 real implementations)         │
│  Production (logger · metrics · tracing · rate-limit · cache)│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Static Analyzers (66 rules)                    │
│  Security (13) · Bugs (11) · Performance (42) · Architecture│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Prisma ORM + SQLite (11 models)                │
│  Analysis · ChatMessage · FileSummary · UserSettings        │
│  User · Account · Session · VerificationToken               │
│  MemoryEntry · AgentTask · AgentEvent                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.18+ or **Bun** 1.0+
- **Git**
- An AI provider API key (OpenRouter recommended — free tier available)

### Installation

```bash
# Clone
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET (any long random string)
# DATABASE_URL defaults to SQLite (file:./db/local.db) — works offline

# Push database schema (creates 11 tables in local SQLite)
bun run db:push

# Start dev server
bun run dev
```

Open `http://localhost:3000`. All data is stored locally in `db/local.db`.

> 📖 **Deploy to Vercel + Neon?** See [`DEPLOY.md`](./DEPLOY.md) for the
> full production deployment walkthrough.

### Connect Your First AI Provider

1. Go to **AI Providers** (sidebar)
2. Click **Add AI Provider**
3. Choose a provider (e.g., OpenRouter)
4. Paste your API key (stored in browser localStorage only)
5. Toggle **enabled**, click **Test** to verify
6. (Optional) Route features: Bug Detection → Claude, Chat → GPT-4o...

### Analyze Your First Repo

1. Paste a GitHub repo URL (e.g., `https://github.com/vercel/next.js`)
2. Click **Analyze Repo**
3. Wait for the 8-stage pipeline (~30-60s depending on repo size)
4. Explore the 9-tab report

### Try the Autonomous Workflow

1. Go to **AI Agents** (sidebar)
2. Click **Workflow Runner** tab
3. Enter a goal: "Add dark mode toggle to the landing page"
4. Click **Run Workflow**
5. Watch the 5 phases execute:
   - Planning + task graph
   - Write file changes
   - Build/test/lint verification
   - Commit + push
   - Final report

---

## ⚙️ Configuration

### Environment Variables (`.env`)

```bash
# SQLite database (local — Prisma creates the file on first db:push)
DATABASE_URL="file:./db/local.db"

# NextAuth (random string for session encryption)
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (optional — for private repo analysis)
# https://github.com/settings/developers
GITHUB_ID="your-github-oauth-client-id"
GITHUB_SECRET="your-github-oauth-client-secret"

# Google OAuth (optional)
GOOGLE_ID="your-google-oauth-client-id"
GOOGLE_SECRET="your-google-oauth-client-secret"
```

> OAuth is optional. The app works fully with public repos + AI provider keys. OAuth is only needed for private repo analysis.

### Scripts

```bash
bun run dev          # Dev server (port 3000, hot reload)
bun run build        # Production build
bun run start        # Run production server
bun run lint         # ESLint check
bun run db:push      # Push schema to local SQLite
bun run db:generate  # Regenerate Prisma client
bun run db:migrate   # Create + apply a migration (local)
bun run db:reset     # Reset database (⚠️ deletes all data)
# Production (Postgres):
bun run db:push:prod   # Push schema to Postgres (Vercel/Neon)
bun run db:deploy      # Apply pending migrations to Postgres
```

---

## 🤖 Multi-Agent System

### Core Infrastructure (`src/lib/agents/`)

| File | Purpose |
|------|---------|
| `types.ts` | 11 AgentId, Task, ExecutionGraph, EventBusEvent |
| `event-bus.ts` | Pub/sub with wildcard subscriptions + 500-event replay buffer |
| `task-queue.ts` | Priority queue, dependency ordering, retry (exponential backoff), timeout, cancellation |
| `shared-context.ts` | Per-task shared memory (decisions, events, working files) |
| `agent-registry.ts` | Register/lookup agents + kind→agent mapping |
| `agent-scheduler.ts` | Execute ExecutionGraph with parallel node dispatch |
| `message-bus.ts` | Agent-to-agent communication (send/receive/broadcast) |
| `base-agent.ts` | Abstract BaseAgent class |
| `repository-memory.ts` | Long-term per-repo memory with semantic search |
| `retry-policy.ts` | DEFAULT/AGGRESSIVE/NO_RETRY/GIT_RETRY policies |
| `ai-client.ts` | callAI/callAIForJSON/streamAI (OpenAI/Anthropic/Gemini) |
| `event-persister.ts` | Auto-persist task lifecycle to Prisma |
| `index.ts` | Central registration — `registerAllAgents()` |

### 11 Agents

Each agent extends `BaseAgent`, implements `execute()`, and is registered centrally in `index.ts`:

- **Planner** — LLM-driven task breakdown → ExecutionGraph
- **Orchestrator** — coordinates the full pipeline
- **Repository Analyst** — fetches GitHub files, parses, analyzes
- **Code Reviewer** — Senior Engineer review with scoring
- **Bug Fixer** — stack trace → patch → tsc/lint verify → retry
- **Test Agent** — generate tests → run → fix failures → retry
- **Refactoring Agent** — extract functions, simplify, rename
- **Documentation Agent** — README/API/architecture/deployment docs
- **Security Agent** — 13-rule static + AI deep review with CWE
- **Performance Agent** — 42-rule + AI prioritized optimizations
- **DevOps Agent** — Docker/K8s/CI/CD/deploy configs

### Retry + Timeout + Cancellation

Every task has:
- **Retry policy** (exponential backoff: 1s → 2s → 4s, max 30s)
- **Timeout** via AbortController
- **Cancellation** — abort signal kills running handlers
- **Progress tracking** — 0-100% with messages

---

## 🔄 Autonomous Workflow

### `runAutonomousWorkflow(options)`

Full pipeline:

```typescript
import { runAutonomousWorkflow } from "@/lib/workflow/autonomous-runner";

const result = await runAutonomousWorkflow({
  goal: "Add Google OAuth login",
  repositoryUrl: "https://github.com/user/repo",
  provider: { providerId: "openrouter", apiKey: "...", baseUrl: "...", model: "..." },
  autoCommit: true,        // commit + push after success
  timeoutMs: 600000,       // 10 min
  onProgress: (p, msg) => console.log(`${p}%: ${msg}`),
  onEvent: (event) => console.log(event.type),
});

// result.phases — 5 phases with status + duration
// result.buildResult — tsc + lint + test results
// result.commitResult — SHA + message + pushed
// result.finalReport — markdown summary
```

### `pairProgram(request)`

Chat-style entry point for natural language requests:

```typescript
import { pairProgram } from "@/lib/workflow/autonomous-runner";

const result = await pairProgram("Add dark mode toggle", {
  provider: myProvider,
  onProgress: (p, msg) => updateUI(p, msg),
});
```

### `runSingleTask(kind, input)`

Direct single-agent execution:

```typescript
import { runSingleTask } from "@/lib/workflow/autonomous-runner";

const result = await runSingleTask("review", {
  files: [{ path: "src/app.ts", content: "..." }],
  provider: myProvider,
});
```

---

## 🔍 Static Analyzers

### Security (13 rules)

Hardcoded secrets (sk-*, ghp_*, AIza*), SQL injection, XSS (dangerouslySetInnerHTML), weak hashing (MD5/SHA1), missing CSRF, insecure deserialization, path traversal, open redirects, debug mode in prod, CORS wildcard, insecure random, missing rate limit.

### Bugs (11 rules)

Race conditions, null derefs, off-by-one errors, unchecked promises, type coercion bugs, mutable default arguments, switch fallthrough, missing await, floating point comparison, integer overflow, division by zero.

### Performance (42 rules)

| Category | Rules |
|----------|-------|
| **Bundle** (6) | lodash full import, moment.js, underscore, rxjs wildcard, antd full, barrel re-exports |
| **Memory leaks** (4) | setInterval/addEventListener/setTimeout without cleanup, subscriptions without unsubscribe |
| **React** (10) | missing useMemo/useCallback, useState object spread, inline styles, missing React.memo, large components, missing keys, many inline handlers, dangerouslySetInnerHTML, missing Suspense, nested ternaries |
| **Async/JS** (5) | sequential await in loop, async without await, console.log in prod, eval/new Function, setTimeout for animation |
| **Next.js** (3) | missing dynamic import, `<img>` vs next/image, unnecessary "use client" |
| **Query/DB** (2) | N+1 query, unbounded findMany |
| **Advanced** (12) | object/array default props, large inline data, useEffect without deps, many useState, props to memoized child, JSON.parse in render, string concat in loop, layout thrashing, DOM query in render, sync file I/O, RegExp in render, default prop values |

### Architecture (Robert C. Martin metrics)

| Metric | Formula | Meaning |
|--------|---------|---------|
| **Instability (I)** | `Ce / (Ca + Ce)` | 0=stable, 1=volatile |
| **Abstractness (A)** | `Na / Nc` | 0=concrete, 1=abstract |
| **Distance from Main (D)** | `\|A + I - 1\|` | 0=optimal, 1=worst |
| **Fan-in / Fan-out** | count | depend on me / I depend on |
| **Coupling** | avg imports/file | dependency density |
| **Cohesion** | intra-dir / total | module grouping |

Plus: layer violation detection (component → DB), directory-level circular dep DFS, god module detection (>20 functions), linting config detection, CI/CD config detection.

---

## 🤖 AI Providers

14 providers supported with feature-based routing:

| Provider | Best For | Notes |
|----------|----------|-------|
| **OpenRouter** | Multi-model | 1 key, 100+ models. **Recommended.** |
| **OpenAI** | Chat, vision | GPT-4o, GPT-4o-mini, o1 |
| **Anthropic** | Long context | Claude 3.5 Sonnet, Opus |
| **Google Gemini** | Vision, long ctx | Gemini 1.5 Pro, Flash |
| **DeepSeek** | Code reasoning | Coder V2, V3 |
| **Groq** | Fast inference | Llama 3.1, Mixtral |
| **Ollama** | Local, offline | Free, runs locally |
| **LM Studio** | Local, offline | Free, runs locally |
| **Azure OpenAI** | Enterprise | Needs deployment name |
| **Together AI** | Open models | Llama, CodeLlama |
| **Fireworks AI** | Fast inference | Llama 3, Mixtral |
| **Mistral** | EU compliance | Mistral Large, Codestral |
| **xAI** | Reasoning | Grok-2 |
| **Custom** | Any OpenAI-compatible | baseUrl + apiKey |

### Feature Routing

Each feature can route to a different model:

`chat` · `bugs` · `security` · `performance` · `architecture` · `docs` · `vision` · `refactor` · `summary`

---

## 🔌 Plugin SDK

5 plugins with **real fetch() API implementations** + 12 manifest catalog:

| Plugin | Status | Auth | Actions |
|--------|--------|------|---------|
| **GitHub** | ✅ Real | `token` | list-repos, get-repo, list-issues, create-issue, list-prs, create-pr, get-readme |
| **GitLab** | ✅ Real | `PRIVATE-TOKEN` | list-projects, get-project, list-issues, create-issue, list-mrs, create-mr, list-pipelines |
| **Slack** | ✅ Real | `Bearer` | send-message, list-channels, get-history, search-messages, list-users, notify |
| **Notion** | ✅ Real | `Bearer` + Notion-Version | search-pages, get-page, create-page, get-databases, query-database, append-blocks |
| **Jira** | ✅ Real | Basic auth | search-issues, get-issue, create-issue, list-projects, transition-issue, add-comment |

Catalog manifests (configure-ready): Linear, Discord, Figma, Supabase, Firebase, OpenRouter, Ollama.

```typescript
import { pluginManager, githubPlugin } from "@/lib/plugins";

pluginManager.register(githubPlugin, { token: "ghp_..." });
const repos = await pluginManager.execute("github", "list-repos", {});
```

---

## 🛡 Production Hardening

7 modules in `src/lib/production/`:

| Module | Features |
|--------|----------|
| **logger** | 5-level (debug/info/warn/error/fatal), colorized console, 1000-entry ring buffer, JSON/JSONL export, event-bus integration |
| **metrics** | Counters, gauges, timings, histograms, p50/p95/p99 summary, 10K ring buffers per metric |
| **tracing** | Distributed spans, auto-parenting, `withTrace()` context stack, 100 traces × 50 spans LRU |
| **rate-limiter** | Token-bucket algorithm, named registry (api=100/min, ai=20/min, terminal=30/min, git=10/min) |
| **graceful-shutdown** | SIGTERM/SIGINT/beforeExit handler, LIFO cleanup, per-handler 10s timeout, 4 default handlers |
| **cache** | LRU + TTL, named registry, hit/miss stats, `sweepExpired()` |
| **index** | `initProduction()` one-shot initializer |

---

## 🌐 Internationalization

- **English** 🇺🇸 + **Tiếng Việt** 🇻🇳
- **13 namespaces**: common, settings, dashboard, analysis, landing, reports, errors, providers, personality, developer, history, chat, notifications
- **SSR-safe**: cookie-based, no hydration mismatch
- **Browser auto-detection** on first visit
- **LanguageSwitcher** in topbar (instant switch, no reload)
- **AI responds** in selected language (injected into system prompt)

---

## 📁 Project Structure

```
CodeInsightAI/
├── prisma/
│   └── schema.prisma              # 11 models
├── public/                        # logo, robots.txt
├── locales/
│   ├── en/                        # 13 namespace JSONs
│   └── vi/                        # mirror of en/
├── src/
│   ├── app/
│   │   ├── api/                   # 18 API routes
│   │   │   ├── agents/            # execute, status
│   │   │   ├── workflow/          # autonomous
│   │   │   ├── terminal/          # run
│   │   │   ├── git/               # operation
│   │   │   ├── analyze/           # GitHub fetch + analyze
│   │   │   ├── chat/              # AI chat with repo context
│   │   │   ├── auth/[...nextauth] # NextAuth.js
│   │   │   ├── history/           # list/get analyses
│   │   │   ├── jobs/[id]/         # poll job status
│   │   │   ├── providers/test/    # validate API key
│   │   │   ├── report/            # full report by id
│   │   │   ├── reset/             # delete account
│   │   │   ├── settings/          # user settings
│   │   │   ├── parse/             # parse repo URL
│   │   │   ├── search/            # semantic search
│   │   │   └── health/            # health check
│   │   ├── globals.css
│   │   ├── layout.tsx             # SSR locale + theme
│   │   └── page.tsx               # view orchestrator
│   ├── components/
│   │   ├── 3d/                    # React Three Fiber AI Core
│   │   ├── shared/                # app-shell, dependency-graph, debug-panel, etc.
│   │   ├── ui/                    # shadcn/ui components
│   │   └── views/                 # 10 views
│   │       ├── landing-view.tsx
│   │       ├── dashboard-view.tsx
│   │       ├── analyze-view.tsx
│   │       ├── project-view.tsx
│   │       ├── chat-view.tsx
│   │       ├── history-view.tsx
│   │       ├── providers-view.tsx
│   │       ├── personalities-view.tsx
│   │       ├── agents-view.tsx    # Multi-Agent UI (4 tabs)
│   │       └── settings-view.tsx
│   └── lib/
│       ├── agents/                # 25 files — Multi-Agent System
│       ├── repo-editor/           # 5 files — file CRUD + diff + undo/redo
│       ├── terminal/              # 4 files — sandboxed shell
│       ├── git-intelligence/      # 5 files — 20 git ops + AI commit
│       ├── knowledge/             # 3 files — semantic memory
│       ├── plugins/               # 8 files — Plugin SDK + 5 builtins
│       ├── production/            # 7 files — logger/metrics/tracing/etc.
│       ├── workflow/              # 1 file — autonomous-runner
│       ├── analyzers/             # 4 files — security/bugs/performance/architecture
│       ├── types.ts
│       ├── repo-parser.ts
│       ├── analysis-engine-v2.ts
│       ├── prompt-engine.ts
│       ├── providers.ts           # 14 provider presets
│       ├── personalities.ts       # 5 built-in personalities
│       ├── i18n.ts
│       ├── auth.ts                # NextAuth config
│       └── db.ts                  # Prisma client
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 🔌 API Reference

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze` | Analyze a repo (sync or async mode) |
| `GET` | `/api/analyze?limit=30` | List recent analyses |
| `GET` | `/api/report?id=...` | Get full report by id |
| `GET` | `/api/history` | List analysis history |
| `GET` | `/api/jobs/[id]` | Poll job status |

### Multi-Agent System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents/execute` | Enqueue a single task |
| `GET` | `/api/agents/execute?taskId=...` | Poll task status |
| `GET` | `/api/agents/execute` | List all tasks |
| `GET` | `/api/agents/status` | Agent system status (11 agents + queue + events) |

### Autonomous Workflow

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/workflow/autonomous` | Run full workflow / single task / pair-program |

**Modes:**
```json
// Full workflow
{ "mode": "workflow", "goal": "Add Google Login", "provider": {...}, "autoCommit": true }

// Single task
{ "mode": "single", "kind": "review", "input": {...} }

// AI Pair Programmer
{ "mode": "pair-program", "request": "Add dark mode toggle" }
```

### Terminal + Git

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/terminal/run` | Run sandboxed shell command |
| `POST` | `/api/git/operation` | 20 git operations + AI commit message |

**Git operations:** status, diff, stage, unstage, commit, commit-ai, push, pull, fetch, stash, stash-pop, create-branch, checkout, merge, rebase, recent-commits, current-branch, remotes, changelog, review-diff

### Chat + Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | AI chat with repo context |
| `GET` | `/api/auth/session` | NextAuth session |
| `POST` | `/api/providers/test` | Validate API key |
| `GET/POST` | `/api/settings` | User settings |
| `DELETE` | `/api/reset` | Delete account |

---

## 🔐 Privacy

| Data | Stored Where | Sent Where |
|------|-------------|------------|
| API keys | Browser `localStorage` | ❌ Never to CodeInsight servers |
| Analyses | SQLite local (`db/custom.db`) | ❌ |
| Chat messages | SQLite local | ❌ |
| Agent tasks/events | SQLite local (AgentTask + AgentEvent tables) | ❌ |
| Repository code | In-memory cache (1hr TTL) | → GitHub API (fetch) → AI provider (analyze) |
| Settings | Browser `localStorage` | ❌ |

- **No middleman server** — browser talks directly to your AI provider
- **Offline mode** — connect Ollama / LM Studio local
- **Delete account** — Settings → Danger Zone → Delete account (wipes all data)

---

## 🗺 Roadmap

### ✅ Completed (Phase 1-3)

- [x] 8-stage analysis pipeline with real GitHub fetch
- [x] 4 static analyzers (66 rules total)
- [x] d3-force interactive dependency graph
- [x] Dynamic SVG diagrams (UML, Sequence, ERD)
- [x] 14 AI providers + feature routing
- [x] AI Personality System (5 built-in + custom CRUD)
- [x] Developer Mode + Debug Panel (secret masking)
- [x] Personalization (theme/accent/density/animation/accessibility)
- [x] i18n (en/vi) — SSR-safe
- [x] NextAuth GitHub OAuth (private repo support)
- [x] **Multi-Agent System (11 agents)**
- [x] **Autonomous Workflow (plan → code → build → test → commit → push)**
- [x] **Repository Editor (file CRUD + diff + undo/redo)**
- [x] **AI Terminal (sandboxed + permissions)**
- [x] **Git Intelligence (20 ops + AI commit)**
- [x] **Knowledge Base (Prisma-persisted semantic memory)**
- [x] **Plugin SDK (5 real implementations)**
- [x] **Production Hardening (logger/metrics/tracing/rate-limit/graceful-shutdown/cache)**

### 🚧 Next Steps

- [ ] Streaming chat responses (SSE)
- [ ] Real embeddings (local sentence-transformers)
- [ ] Vector search with cosine similarity
- [ ] Multi-repo comparison
- [ ] Diff analysis (compare 2 commits)
- [ ] Export report as PDF
- [ ] VS Code extension
- [ ] GitHub Action integration

---

## 🤝 Contributing

Contributions welcome!

1. Fork the repo
2. Create branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- **TypeScript strict** — no `any` where avoidable
- **ESLint** must pass: `bun run lint`
- **shadcn/ui** components preferred over custom implementations
- **i18n** — every new UI string must be added to both `locales/en/` and `locales/vi/`
- **Secret masking** — never log API keys raw; use `maskSecrets()` from `src/lib/secret-mask.ts`
- **Cross-platform** — terminal commands must work on both Windows and Unix

---

## 📄 License

**MIT** © [vanhoi04082006-pixel](https://github.com/vanhoi04082006-pixel)

See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for developers who want AI that ships code, not just suggests it.**

⭐ Star this repo if it's useful!

[Report Bug](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Request Feature](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Discussions](https://github.com/vanhoi04082006-pixel/CodeInsightAI/discussions)

</div>
