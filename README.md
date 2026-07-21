<div align="center">

# 🧠 CodeInsight AI

### Autonomous AI Software Engineering Platform

**Paste a GitHub Repository. AI Understands Everything. Then Plans, Analyzes, Tests, Fixes, and Ships Code — Autonomously.**

12 collaborating AI agents that analyze, edit, test, and ship code without step-by-step human guidance.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)
![Stripe](https://img.shields.io/badge/Stripe-Billing-635bff?logo=stripe)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [SaaS Model](#-saas-model)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Privacy](#-privacy)
- [License](#-license)

---

## 🎯 Overview

**CodeInsight AI** is a SaaS platform where 12 specialized AI agents collaborate to:

1. **Analyze** any GitHub repository (public + private via OAuth)
2. **Plan** implementation tasks with dependency graphs (ReAct loop)
3. **Edit** code (file CRUD, import updates, refactoring)
4. **Test** — generate tests, run them, read failures, fix, retry until pass
5. **Fix bugs** — read stack traces, propose patches, verify with tsc + lint
6. **Review code** like a Senior Engineer (score + comments)
7. **Generate docs** — README, API, architecture, deployment guides
8. **Commit + push** with AI-generated conventional commit messages
9. **Generate PRs** with title, breaking changes, migration guide
10. **Deploy** — Docker, K8s, CI/CD, Vercel/Railway configs

### Two AI Modes

| Mode | How it works | Cost |
|------|-------------|------|
| **BYOK (Bring Your Own Key)** | User enters their own API key | **Free forever** |
| **Platform AI** | Server uses our key (hidden from user) | **$9/month (Pro)** |

---

## ✨ Key Features

### 🤖 12 AI Agents (Multi-Agent System)

| Agent | Role |
|-------|------|
| **Orchestrator** | Coordinates the full autonomous workflow |
| **Planner** | Breaks goals into task graphs with dependencies |
| **Repository Analyst** | Fetches + parses repos, builds dependency graphs |
| **Code Reviewer** | Reviews readability, architecture, naming — scores 0-100 |
| **Bug Fixer** | Reads stack traces, proposes patches, verifies with tsc + lint |
| **Test Agent** | Generates tests, runs them, fixes failures, retries |
| **Refactoring Agent** | Extracts functions, simplifies, renames |
| **Documentation Agent** | Generates README, API docs, architecture docs |
| **Security Agent** | 13-rule static analysis + AI deep review with CWE |
| **Performance Agent** | 42-rule analysis + AI prioritized optimizations |
| **DevOps Agent** | Docker, K8s, CI/CD, deploy configs |
| **Reflection Agent** | Analyzes failures, identifies root causes, adjusts confidence |

### 🔄 Autonomous Workflow (ReAct Loop)

```
User Goal → Planner → Scheduler → Agents (parallel) →
Build/Test/Lint → Bug Fixer (if fail) → Replanner (if needed) →
Commit → Push → Final Report
```

Uses Observe→Think→Act→Verify→Reflect→Repeat loop with:
- Dynamic tool selection (10 tools)
- Agent debate + consensus voting
- Confidence scoring (0-100%)
- Memory loop (semantic + long-term)
- Quality gate (build + test + lint + review)
- Rollback + replanning on failure

### 📊 Deep Static Analysis (66 rules)

| Analyzer | Rules |
|----------|-------|
| **Security** | 13 (hardcoded secrets, SQL injection, XSS, weak hashing, path traversal) |
| **Bugs** | 11 (race conditions, null derefs, off-by-one, unchecked promises) |
| **Performance** | 42 (bundle bloat, memory leaks, React anti-patterns, N+1 queries) |
| **Architecture** | Robert C. Martin metrics (Instability, Abstractness, Distance from Main Sequence) |

### 🎛 Mission Control

Premium AI command center with:
- Resizable panels (react-resizable-panels)
- Live agent activity feed (SSE streaming)
- Agent network graph (d3-force)
- File diff viewer with syntax highlighting
- Terminal (sandboxed, ANSI colors)
- Git operations (20 commands)
- Confidence meter + world state panel
- Agent dock (Discord-style, 12 agents)
- Demo mode (works without backend)

### 💬 Streaming Chat

- **SSE streaming** — AI responds character by character
- Markdown rendering (code blocks with copy, blockquotes, lists)
- Typing indicator + suggestion chips
- Supports OpenAI, Anthropic, Gemini, OpenRouter, Ollama, and 9 more

### 🌐 i18n (English + Tiếng Việt)

- 15 namespaces, SSR-safe cookie-based
- Instant language switching (no reload)
- AI responds in selected language

### 🎨 Premium UI

- Custom glow cursor (ring + dot, lerp follow)
- Button ripple effects
- Card lift + shimmer on hover
- Error boundary + loading skeleton
- Theme switcher (light/dark/system)
- 9 accent colors + density + animation controls
- Accessibility (font size, reduced motion, high contrast, color-blind modes)
- Glassmorphism design system

---

## 💰 SaaS Model

### Pricing

| Plan | Price | AI Mode | Features |
|------|-------|---------|----------|
| **Free** | $0 | BYOK only | All features, unlimited analyses, bring your own API key |
| **Pro** | $9/mo | BYOK + Platform AI | No key needed (Claude 3.5 / GPT-4o), priority support |
| **Team** | $29/mo | Same + 5 users | Shared analyses, team providers |
| **Enterprise** | Contact | On-premise | SSO, audit logs, custom integrations |

### How it works

```
User opens app → Landing (public)
Clicks "Sign in" → GitHub OAuth (required)
Enters Dashboard → Settings → AI tab
Two modes:
  BYOK: enter own API key → FREE, unlimited
  Platform AI: Stripe checkout ($9/mo) → use our AI key
All features work the same in both modes
```

### Security

- API keys encrypted with **AES-256-GCM** (server-side)
- Keys NEVER exposed to frontend (masked display only)
- Platform AI key stored in env vars (hidden from users)
- Stripe handles all payment processing (PCI compliant)

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** 18.18+ or **Bun** 1.0+
- **Git**

### Installation

```bash
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI
bun install
cp .env.example .env
# Edit .env — set DATABASE_URL, NEXTAUTH_SECRET
bunx prisma db push
bun run dev
```

Open `http://localhost:3000`.

### Connect AI Provider

1. Go to **AI Providers** (sidebar)
2. Click **Add AI Provider**
3. Choose a provider (OpenRouter recommended)
4. Paste your API key
5. Toggle **enabled**, click **Test**

---

## 🚢 Deployment (Vercel + Neon)

See **[DEPLOY.md](DEPLOY.md)** for complete step-by-step guide.

### Quick summary:

1. **Neon** — Create PostgreSQL project → copy `DATABASE_URL`
2. **GitHub OAuth App** — Create → copy `GITHUB_ID` + `GITHUB_SECRET`
3. **Stripe** (optional) — Create products → copy `STRIPE_SECRET_KEY` + price IDs
4. **OpenRouter** (optional) — Get API key for Platform AI mode
5. **Vercel** — Import repo → set env vars → Deploy
6. **Prisma** — `DATABASE_URL=... bunx prisma db push`
7. **Update** OAuth callback URL + Stripe webhook URL

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | Random string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ✅ | Your Vercel domain |
| `GITHUB_ID` | ✅ | GitHub OAuth Client ID |
| `GITHUB_SECRET` | ✅ | GitHub OAuth Client Secret |
| `PLATFORM_AI_API_KEY` | Optional | OpenRouter key for Platform AI mode |
| `PLATFORM_AI_BASE_URL` | Optional | `https://openrouter.ai/api/v1` |
| `PLATFORM_AI_MODEL` | Optional | `anthropic/claude-3.5-sonnet` |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO` | Optional | Stripe Price ID for Pro plan |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│  Landing · Dashboard · Analyze · Project · Chat         │
│  History · Providers · Personalities · Mission · Settings│
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   API Routes (26)                        │
│  /api/analyze · /api/chat · /api/chat/stream             │
│  /api/agents · /api/mission · /api/terminal · /api/git   │
│  /api/billing · /api/providers/credentials · /api/usage  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Autonomous Workflow (ReAct)                 │
│  Observe → Think → Act → Verify → Reflect → Repeat      │
│  + Tool Selection + Agent Debate + Replanner + Rollback  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│               12 AI Agents + Shared Memory               │
│  Event Bus · Task Queue · Message Bus · Confidence       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│    Static Analyzers (66 rules) + Production Modules      │
│  Security · Bugs · Performance · Architecture            │
│  Logger · Metrics · Tracing · Rate Limiter · Cache       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│         Neon PostgreSQL (13 models) + Stripe             │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Language** | TypeScript 5 (strict) |
| **Styling** | Tailwind CSS 4 + shadcn/ui |
| **State** | Zustand + TanStack Query |
| **Database** | Prisma ORM + Neon PostgreSQL |
| **Auth** | NextAuth.js v4 (GitHub OAuth) |
| **Billing** | Stripe (subscriptions + checkout + portal) |
| **AI** | 14 providers (OpenRouter, OpenAI, Anthropic, Gemini, Ollama, etc.) |
| **Animation** | Framer Motion |
| **Charts** | Recharts + d3-force |
| **Icons** | Lucide React |
| **Deploy** | Vercel |

---

## 📁 Project Structure

```
CodeInsightAI/
├── prisma/schema.prisma          # 13 models (PostgreSQL)
├── src/
│   ├── app/
│   │   ├── api/                  # 26 API routes
│   │   ├── error.tsx             # Error boundary
│   │   ├── loading.tsx           # Loading skeleton
│   │   └── page.tsx              # View orchestrator + auth gate
│   ├── components/
│   │   ├── views/                # 10 views
│   │   ├── mission/              # Mission Control (11 components)
│   │   └── shared/               # UI, cursor, login, theme, etc.
│   └── lib/
│       ├── agents/               # 25 files (12 agents + ReAct + tools)
│       ├── analyzers/            # 4 analyzers (66 rules)
│       ├── billing/              # Stripe + usage tracking
│       ├── workflow/             # Autonomous runner
│       ├── production/           # Logger, metrics, tracing, rate-limiter
│       ├── i18n.ts               # 15 namespaces (en/vi)
│       ├── crypto.ts             # AES-256-GCM encryption
│       └── db.ts                 # Prisma client
├── locales/{en,vi}/              # 15 JSON files per language
├── vercel.json                   # Deploy config
├── DEPLOY.md                     # Step-by-step deploy guide
└── .env.example                  # All env vars documented
```

---

## 🔌 API Reference

### Core APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze` | Analyze a repo (sync/async) |
| `POST` | `/api/chat` | Chat with AI (supports streaming) |
| `POST` | `/api/chat/stream` | SSE streaming chat |
| `GET` | `/api/agents/status` | 12 agents + queue stats |
| `POST` | `/api/agents/execute` | Enqueue agent task |
| `POST` | `/api/mission/start` | Start autonomous mission |
| `GET` | `/api/mission/stream` | SSE mission events |
| `POST` | `/api/terminal/run` | Sandboxed shell command |
| `POST` | `/api/git/operation` | 20 git operations |
| `POST` | `/api/workflow/autonomous` | Full workflow / pair-program |

### SaaS APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/usage` | Usage + limits + quotas |
| `GET/POST/DELETE` | `/api/providers/credentials` | Encrypted API key CRUD |
| `POST` | `/api/billing/checkout` | Stripe checkout session |
| `POST` | `/api/billing/portal` | Stripe customer portal |
| `POST` | `/api/billing/webhook` | Stripe webhook handler |
| `GET/POST` | `/api/settings` | User settings (profile, etc.) |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Command Palette |
| `⌘D` | Dashboard |
| `⌘A` | Analyze |
| `⌘H` | History |
| `⌘,` | Settings |
| `⌘P` | Providers |
| `⌘M` | Mission Control |
| `⌘C` | Chat |
| `Esc` | Back to Landing |
| `g` + key | Vim-style navigation |

---

## 🔐 Privacy

- API keys encrypted with **AES-256-GCM** (never stored in plaintext)
- Platform AI key stored in env vars (never exposed to frontend)
- All AI calls go directly to the provider (no middleman)
- GitHub OAuth with `repo` scope (for private repo analysis)
- Stripe handles all payments (PCI compliant)
- User can delete account + all data anytime

---

## 📄 License

**MIT** © [vanhoi04082006-pixel](https://github.com/vanhoi04082006-pixel)

---

<div align="center">

**Built with ❤️ for developers who want AI that ships code, not just suggests it.**

⭐ Star this repo if it's useful!

[Report Bug](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Request Feature](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Discussions](https://github.com/vanhoi04082006-pixel/CodeInsightAI/discussions)

</div>
