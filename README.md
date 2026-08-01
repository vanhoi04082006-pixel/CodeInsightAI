<div align="center">

# 🧠 CodeInsight AI

### AI-Powered Code Intelligence Platform

**Paste a GitHub Repository. AI Understands Everything.**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📖 Overview

CodeInsight AI is an enterprise-grade code intelligence platform that analyzes any GitHub repository using AI. It combines static analysis (250 rules) with 9 AI deep-analysis passes to produce structured, evidence-backed insights — security vulnerabilities, performance bottlenecks, architecture review, code quality, and actionable roadmaps.

### Key Differentiators

- **AI-first architecture** — Static analysis provides facts; AI provides conclusions with evidence + confidence
- **Structured AI output** — Every AI finding includes `evidence[]` (file:line), `confidence` (0-1), `fixPlan[]`, `severity`
- **Graph Engine** — Symbol-level code graph (calls, uses, extends, implements) with O(1) query API for AI agents
- **Diagram Engine** — 6 diagram types (UML, Sequence, ERD, Architecture, Module, Component) with 4 layouts + Mermaid/PlantUML/SVG export
- **Enterprise hardening** — Secret redaction (17 patterns), token budget enforcement, rate limiting, policy engine, audit log, model fallback
- **Full i18n** — Vietnamese + English (21 namespaces, 2,300+ keys, technical terms preserved)

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User (GitHub OAuth)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              UI (10 tabs + Code Explorer V2)                  │
│  Overview │ Architecture │ Bugs │ Security │ Performance    │
│  Code Graph │ Code │ Docs │ Roadmap │ Timeline              │
│  + AI fallback UI (amber "unavailable" / cyan "running")     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    API Gateway (46 routes)                   │
│  /api/analyze │ /api/chat │ /api/agents │ /api/analysis/*   │
│  /api/graph │ /api/diagram │ /api/docs/enhance               │
│  + Rate Limiting + Policy Engine + Ownership checks          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   AI Orchestrator (9 passes)                 │
│  overview → summary → priorities → security → architecture  │
│  → quality → performance → bestPractices → duplicates       │
│  + Structured output (evidence + confidence + fixPlan)       │
│  + Model Fallback chain + Secret Redaction (17 patterns)     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                 Core Engines                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Graph Engine│  │Diagram Engine│  │  AI Agents (10)   │  │
│  │  6 providers│  │  6 providers │  │  Direct-call API  │  │
│  │  4 layouts  │  │  4 layouts   │  │  bug-fixer, test, │  │
│  │  Query API  │  │  Export x3   │  │  refactor, etc.   │  │
│  │  O(1) index │  │  Cache + AI  │  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Enterprise Hardening Layer                      │
│  Token Budget · Rate Limiting · Policy Engine (8 policies)  │
│  Audit Log · Secret Redaction · Model Fallback · PDF Export │
│  Multi-tenant Isolation · Ownership Verification            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Database (18 Prisma models)                     │
│  SQLite (dev) / PostgreSQL on Neon (prod)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### AI Analysis (9 passes)

| Pass | Tab | Output |
|------|-----|--------|
| Overview | Overview | Top risks, quick wins, fix first, fastest score gain, health assessment |
| Summary | Overview | Executive summary (2-3 sentences) |
| Security | Security | Root cause + fix code + impact + evidence per issue |
| Architecture | Architecture | Strengths, weaknesses, suggestions + best practices audit |
| Quality | Bugs | Root cause + fix code + impact per bug |
| Performance | Performance | Root cause + fix code + expected improvement |
| Priorities | Roadmap | Effort estimate, release phase (P0-P3), ROI, dependency ordering |
| Best Practices | Architecture | Framework-specific audit (passed/failed, score) |
| Duplicates | Code Graph | AI duplicate analysis (type, files, recommendation, lines saved) |

### Code Explorer V2 (IDE-grade)

- **Expand Context** — Progressive: snippet → 100 lines → full file
- **File Summary** — Lines, functions, classes, complexity, severity stars
- **Issue Highlighting** — Red border on issue lines (VSCode-style)
- **AI Context Optimization** — Sends summary + imports + signatures (~80% token saving)
- **Rich Static Explanation** — Issue / Evidence / Reason / Impact / Recommendation
- **6 AI Modes** — Explain, Security, Performance, Refactor, Tests, Bugs
- **Related Files** — Import-based navigation chips
- **sessionStorage Persist** — Per-file-per-mode cache + Regenerate button

### Code Graph (Unified)

- **6 Graph Types** — Dependencies, Function Calls, Class Hierarchy, Module Imports, API Flow, Database Flow
- **Graph Engine v2** — GraphService facade + GraphIndex (O(1)) + GraphQuery (semantic) + GraphImpact (structured) + AIAnalysisService
- **D3 Force Simulation** — Physics-based layout with drag, pan, zoom, focus mode, path highlight, search
- **AI Analysis** — Type-specific prompts, sessionStorage persistence

### Diagram Engine v2

- **6 Diagram Types** — UML, Sequence, ERD, Architecture, Module, Component
- **4 Layouts** — Dagre TB, Dagre LR, Circular, Force
- **3 Export Formats** — SVG, Mermaid, PlantUML
- **Interactive Renderer** — Zoom, pan, hover, selected, focus mode, search highlight, MiniMap
- **Query Engine** — findPath, findCycles, findImpact, search, getStats
- **Plugin Architecture** — registerProvider, registerLayout, registerExporter

### Enterprise Features

| Feature | Description |
|---------|-------------|
| Secret Redaction | 17 patterns (OpenAI, Anthropic, GitHub, AWS, JWT, Stripe, etc.) — applied before every AI call |
| Token Budget | Free 1M / Pro 10M / Team 50M per month — hard block when exceeded |
| Rate Limiting | DB-backed, per-user, per-endpoint (10 analyses/hr for Free) |
| Policy Engine | 8 policies (max-files, block-provider, block-language, etc.) — 2 checkpoints |
| Model Fallback | Provider chain — auto-switch on 402/429/5xx/timeout |
| Audit Log | Every AI call logged (provider, model, tokens, latency, status, redaction count) |
| PDF + JSON Export | Analysis report export (scores, issues, AI overview, roadmap) |
| Multi-tenant Isolation | Ownership checks on all endpoints — 4 leaks fixed |

### i18n (Vietnamese + English)

- 21 namespaces, 2,300+ keys
- Full parity (EN = VI)
- Technical terms preserved (GitHub, API, AST, BYOK, Platform AI, CodeGraph)
- Honest naming (static = no "AI" label)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ / Bun
- GitHub OAuth App (for authentication)
- PostgreSQL (production) or SQLite (local dev)

### Installation

```bash
# Clone
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Set up database
bun run db:push

# Start dev server
bun run dev
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."  # Neon PostgreSQL (prod)
# DATABASE_URL="file:./dev.db"   # SQLite (dev)

# NextAuth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth
GITHUB_ID="your-github-oauth-app-id"
GITHUB_SECRET="your-github-oauth-app-secret"

# Platform AI (optional — admin configures via UI)
PLATFORM_AI_API_KEY="your-api-key"
PLATFORM_AI_PROVIDER="shopaikey"
PLATFORM_AI_BASE_URL="https://api.shopaikey.com/v1"

# Admin (optional — first user auto-promoted)
ADMIN_EMAIL="your-email@example.com"
```

### Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy — `vercel.json` auto-runs `prisma db push` before build

---

## 🛠 Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | Prisma ORM + PostgreSQL (Neon) / SQLite |
| Auth | NextAuth.js v4 (GitHub OAuth, JWT strategy) |
| AI | 15 providers via unified `callAI()` / `streamAI()` |
| Graph | D3-force + dagre (Code Graph) + dagre (Diagram) |
| i18n | Custom (Zustand store, cookie-based, 21 namespaces) |
| Deployment | Vercel (Hobby tier compatible) |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/                    # 46 API routes
│   │   ├── analyze/            # Repository analysis + AI passes
│   │   ├── chat/               # AI chat (streaming + non-streaming)
│   │   ├── agents/             # Direct agent execution
│   │   ├── graph/              # Unified Code Graph API
│   │   ├── diagram/            # Diagram Engine API
│   │   ├── docs/               # AI doc enhancement
│   │   ├── analysis/           # Timeline, diff, regressions, refactor
│   │   ├── admin/              # Admin: platform-ai, policies, users
│   │   └── billing/            # Stripe checkout + webhook
│   ├── guide/                  # User guide page
│   └── page.tsx                # Main app (single route)
├── components/
│   ├── shared/                 # UnifiedCodeGraph, CodeViewer, etc.
│   ├── views/                  # 10 view components
│   ├── admin-tabs/             # Admin overview, policies, users
│   └── ui/                     # shadcn/ui components
├── lib/
│   ├── graph/                  # Graph Engine v2 (6 providers + query + index)
│   ├── diagram/                # Diagram Engine v2 (6 providers + query + export)
│   ├── agents/                 # 9 AI agents (direct-call, no queue)
│   ├── billing/                # Token budget + plan limits
│   ├── policies/               # Policy engine (8 policies)
│   ├── redaction.ts            # Secret redaction (17 patterns)
│   ├── ownership.ts            # Multi-tenant isolation
│   ├── rate-limiter.ts         # DB-backed rate limiting
│   ├── ai-fallback.ts          # Model fallback chain
│   ├── analysis-manifest.ts    # AI passes + tabs (single source of truth)
│   └── i18n.ts                 # i18n store (21 namespaces)
├── locales/
│   ├── en/                     # 21 JSON files
│   └── vi/                     # 21 JSON files (parity)
└── prisma/
    ├── schema.prisma           # SQLite (dev)
    └── schema.prod.prisma      # PostgreSQL (prod)
```

---

## 📊 Project Stats

| Metric | Value |
|--------|-------|
| Total LOC | ~59,000 |
| Components | 92 |
| API routes | 46 |
| Prisma models | 18 |
| AI passes | 9 |
| AI agents | 9 |
| Graph providers | 6 |
| Diagram providers | 6 |
| i18n keys | 2,300+ (EN = VI) |
| Static analysis rules | 250 |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## 📜 License

MIT — see [LICENSE](LICENSE)

## 🔒 Security

See [.github/SECURITY.md](.github/SECURITY.md) for security policy.

---

<div align="center">

**Built for developers, by developers.**

</div>
