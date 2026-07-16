# CodeInsight AI

> **Paste a GitHub Repository. AI Understands Everything.**

A **local-first AI development platform** for GitHub repository analysis. Connect your own AI providers (OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, LM Studio, and more), analyze any repository, and chat with your code like a Senior Staff Engineer.

**Your keys. Your data. Your AI.** No subscriptions, no billing, no feature locks — like Open WebUI / Continue.dev, built for repository analysis.

---

## ✨ Features

- **Deep code understanding** — AI parses every file, builds embeddings, and reasons over the architecture.
- **8-stage analysis pipeline** — Clone → Scan → AST → Dependency Graph → Embeddings → Static Analysis → AI Analysis → Reports.
- **Interactive dependency graph** — zoom/pan, node inspector, circular-dependency & dead-code detection.
- **Security audit** — catches hardcoded secrets, XSS, weak hashing, missing headers.
- **Performance analysis** — bundle bloat, N+1 queries, memory leaks, render bottlenecks.
- **Bug detection** — race conditions, null derefs, off-by-one errors with severity scoring.
- **AI Code Explorer** — syntax-highlighted snippets with AI explanations.
- **Generated diagrams** — UML class, sequence, and ER diagrams (SVG).
- **AI CTO chat** — real LLM integration that reasons over the report context.
- **14 AI providers supported** — bring your own keys, route different features to different models.

## 🛠 Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (New York)
- **React Three Fiber** + **Drei** + **postprocessing** (3D AI Core)
- **Framer Motion** (animations)
- **Prisma ORM** + **SQLite** (local persistence)
- **Zustand** (state) + **TanStack Query** (server state)
- **z-ai-web-dev-sdk** (built-in LLM, override with your own providers)

## 🚀 Getting Started

```bash
# install dependencies
bun install

# set up the database
bun run db:push

# start the dev server
bun run dev
```

Open `http://localhost:3000`.

### Connect your AI

1. Open the app → **AI Providers** (sidebar).
2. Click **Add AI Provider** and pick one (e.g. OpenRouter, Ollama).
3. Enter your API key (stored in your browser's localStorage only — never sent to any server).
4. Toggle **enabled**, click **Test** to verify the connection.
5. Optionally route features to different models (e.g. Bug Detection → Claude, Chat → GPT-4o).

## 📁 Project Structure

```
src/
  app/
    api/            # analyze, report, chat, history routes
    globals.css     # futuristic dark theme
    layout.tsx
    page.tsx        # view orchestrator
  components/
    3d/             # React Three Fiber AI Core
    shared/         # UI primitives, app shell, graphs
    views/          # landing, dashboard, analyze, project, chat, history, settings, providers
  lib/
    types.ts        # domain types
    analysis-engine.ts  # seeded report generator
    providers.ts    # 14 AI provider presets
    providers-store.ts  # persisted provider config (localStorage)
    store.ts        # Zustand nav/analysis state
    db.ts           # Prisma client
prisma/schema.prisma
```

## 🔐 Privacy

- API keys are stored only in your browser's `localStorage`.
- Analyses & chat are persisted in a local SQLite database.
- Nothing is sent to CodeInsight servers — your code talks directly to your AI provider.
- For fully offline use, connect a local Ollama or LM Studio instance.

## 📄 License

MIT
