# 🧠 CodeInsight AI

### Autonomous AI Software Engineering Platform

**Paste a GitHub Repository. AI Understands Everything. Then Plans, Analyzes, Tests, Fixes, and Ships Code — Autonomously.**

Local-first AI development platform with 12 collaborating agents that analyze, edit, test, and ship code without step-by-step human guidance.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Key Features

### 🤖 12 AI Agents (Multi-Agent System)
Orchestrator, Planner, Repository Analyst, Code Reviewer, Bug Fixer, Refactoring, Documentation, Test, Security, Performance, DevOps, Reflection — all collaborate via event bus + message bus.

### 🔄 Autonomous Workflow (ReAct Loop)
Goal → Planner → Scheduler → Agents → Build/Test/Lint → Commit/Push → Report. Uses Observe→Think→Act→Verify→Reflect→Repeat loop with dynamic replanning + rollback.

### 📊 Deep Static Analysis (66 rules)
- **Security**: 13 rules (hardcoded secrets, SQL injection, XSS, weak hashing)
- **Bugs**: 11 rules (race conditions, null derefs, off-by-one)
- **Performance**: 42 rules (bundle bloat, memory leaks, React anti-patterns, N+1)
- **Architecture**: Robert C. Martin metrics (Instability, Abstractness, Distance from Main Sequence)

### 🎛 Mission Control
Premium AI command center with resizable panels, live agent feed, SSE streaming, agent network graph, terminal, git operations, file diff viewer.

### 💬 Streaming Chat
Real-time SSE streaming — AI responds character by character. Supports OpenAI, Anthropic, Gemini, OpenRouter, Ollama, and 9 more providers.

### 🌐 i18n (English + Tiếng Việt)
15 namespaces, SSR-safe cookie-based, instant language switching.

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install
bun install

# Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL, NEXTAUTH_SECRET

# Push database schema
bun run db:push

# Start dev server
bun run dev
```

Open `http://localhost:3000`.

### Connect AI Provider
1. Go to **AI Providers** (sidebar)
2. Click **Add AI Provider**
3. Choose a provider (OpenRouter recommended)
4. Paste your API key (stored in browser localStorage)
5. Toggle **enabled**, click **Test** to verify

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `⌘K` | Command Palette |
| `⌘D` | Dashboard |
| `⌘A` | Analyze |
| `⌘H` | History |
| `⌘,` | Settings |
| `⌘M` | Mission Control |
| `Esc` | Back to Landing |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| State | Zustand + TanStack Query |
| Database | Prisma ORM + SQLite |
| Auth | NextAuth.js v4 |
| Animation | Framer Motion |
| Icons | Lucide React |
| Charts | Recharts |

---

## 📁 Project Structure

```
src/
  app/
    api/              # 21 API routes
    error.tsx         # Error boundary
    loading.tsx       # Loading skeleton
    page.tsx          # View orchestrator
  components/
    views/            # 10 views (landing, dashboard, analyze, project, chat, history, settings, providers, personalities, mission-control)
    shared/           # UI primitives, app shell, graphs
    mission/          # Mission Control components
  lib/
    agents/           # 12 AI agents + ReAct loop + tool registry
    analyzers/        # 4 static analyzers (66 rules)
    workflow/         # Autonomous workflow runner
    production/       # Logger, metrics, tracing, rate-limiter
    i18n.ts           # 15 namespace i18n
    db.ts             # Prisma client
prisma/schema.prisma  # 11 models
locales/{en,vi}/      # 15 JSON files per language
```

---

## 📄 License

**MIT** © [vanhoi04082006-pixel](https://github.com/vanhoi04082006-pixel)
