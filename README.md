<div align="center">

# 🧠 CodeInsight AI

### Production-Grade SaaS — AI Software Engineering Platform

**Paste a GitHub Repository. AI Understands Everything. Analyze, Chat, Plan, Fix, and Ship Code Autonomously.**

12 collaborating AI agents · 66 static analysis rules · 14 AI providers · BYOK (free) + Platform AI ($9/mo)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)
![Stripe](https://img.shields.io/badge/Stripe-Billing-635bff?logo=stripe)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [SaaS Model](#-saas-model)
- [Architecture](#-architecture)
- [Quick Start (Local)](#-quick-start-local)
- [Production Deployment](#-production-deployment)
- [Environment Separation](#-environment-separation)
- [Authentication Flow](#-authentication-flow)
- [AI Provider System](#-ai-provider-system)
- [Security Model](#-security-model)
- [API Reference](#-api-reference)
- [Page Audit Matrix](#-page-audit-matrix)
- [Tech Stack](#-tech-stack)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 🎯 Overview

**CodeInsight AI** is a production SaaS platform where 12 specialized AI agents collaborate to:

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

### Two AI Modes (the SaaS hook)

| Mode | How it works | Cost |
|------|-------------|------|
| **BYOK (Bring Your Own Key)** | User enters their own API key (encrypted server-side with AES-256-GCM) | **Free forever** |
| **Platform AI** | Server uses our key (hidden from user) — Stripe-billed | **$9/month (Pro)** |

---

## 💰 SaaS Model

### Pricing

| Plan | Price | AI Mode | Features |
|------|-------|---------|----------|
| **Free** | $0 | BYOK only | All features, 5 analyses/month, 50 chat messages/month, bring your own API key |
| **Pro** | $9/mo | BYOK + Platform AI | No key needed (Claude 3.5 / GPT-4o), 100 analyses/month, 2000 chat messages/month, streaming + priority queue |
| **Team** | $29/mo | Same + 5 users | Shared analyses, team providers, 500 analyses/month |
| **Enterprise** | Contact | On-premise | SSO, audit logs, custom integrations, unlimited |

### Flow

```
User opens app → Landing (public)
  └─ Clicks "Sign in" → GitHub OAuth (required)
      └─ Dashboard → Settings → AI tab
          ├─ BYOK: enter own API key → FREE
          └─ Platform AI: Stripe checkout ($9/mo) → use our AI key
All features work the same in both modes.
```

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                            │
│  Landing (public) · Dashboard · Analyze · Project Report     │
│  Chat (SSE streaming) · History · AI Providers               │
│  Personalities · Mission Control · Settings                   │
│  Topbar: UserMenu (avatar, plan, logout w/ confirmation)     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  API Routes (26 — all auth-gated)             │
│  /api/analyze · /api/chat · /api/chat/stream (SSE)            │
│  /api/agents · /api/mission · /api/terminal · /api/git        │
│  /api/billing · /api/providers (masked) · /api/usage          │
│  /api/providers/credentials (encrypted) · /api/settings       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│              Autonomous Workflow (ReAct Loop)                 │
│  Observe → Think → Act → Verify → Reflect → Repeat            │
│  + Tool Selection + Agent Debate + Replanner + Rollback       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│               12 AI Agents + Shared Memory                    │
│  Event Bus · Task Queue · Message Bus · Confidence            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│    Static Analyzers (66 rules) + Production Modules           │
│  Security (13) · Bugs (11) · Performance (42) · Architecture  │
│  Logger · Metrics · Tracing · Rate Limiter · Cache            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│         Neon PostgreSQL (11 models) + Stripe Billing          │
│  Local dev: SQLite (zero setup)                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Local)

### Prerequisites

- **Node.js** 18.18+ or **Bun** 1.0+
- **Git**

### Installation

```bash
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI
bun install
cp .env.example .env
```

### Configure GitHub OAuth

1. Go to <https://github.com/settings/developers> → **New OAuth App**
2. Fill in:
   - **Application name**: CodeInsight AI (local)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Copy **Client ID** → paste as `GITHUB_ID` in `.env`
4. Click **Generate a new client secret** → paste as `GITHUB_SECRET` in `.env`

### Push Database Schema + Start

```bash
bun run db:push     # creates SQLite tables
bun run dev         # starts Next.js on http://localhost:3000
```

Open <http://localhost:3000> → click **Sign in** → GitHub OAuth → Dashboard.

### Connect an AI Provider (BYOK)

1. Go to **AI Providers** (sidebar)
2. Click **Add AI Provider**
3. Choose a provider (OpenRouter recommended — 1 key, 100+ models)
4. Paste your API key
5. Click **Save (encrypted)** — the key is AES-256-GCM encrypted server-side
6. Click **Test** to verify connectivity

In local dev only, your API key is also cached in `localStorage` for convenience. In production, only the masked key is in the browser — the raw key never leaves the server.

---

## 🚢 Production Deployment

See **[DEPLOY.md](DEPLOY.md)** for the complete step-by-step guide.

### Quick summary

1. **Neon** — Create PostgreSQL project → copy `DATABASE_URL`
2. **GitHub OAuth App** — Update callback URL to `https://your-app.vercel.app/api/auth/callback/github`
3. **Stripe** (optional) — Create products → copy `STRIPE_SECRET_KEY` + price IDs
4. **OpenRouter** (optional) — Get API key for Platform AI mode
5. **Vercel** — Import repo → set env vars (see below) → Deploy
6. **Database** — `PRISMA_SCHEMA=prisma/schema.prod.prisma DATABASE_URL="..." bunx prisma db push`
7. **Update** Stripe webhook URL + GitHub OAuth callback URL to the Vercel domain

### Required Vercel Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | `https://your-app.vercel.app` |
| `GITHUB_ID` | ✅ | GitHub OAuth Client ID |
| `GITHUB_SECRET` | ✅ | GitHub OAuth Client Secret |
| `APP_ENV` | ✅ | `production` |
| `NEXT_PUBLIC_APP_ENV` | ✅ | `production` |
| `PLATFORM_AI_API_KEY` | Optional | OpenRouter key for Platform AI mode |
| `PLATFORM_AI_BASE_URL` | Optional | `https://openrouter.ai/api/v1` |
| `PLATFORM_AI_MODEL` | Optional | `anthropic/claude-3.5-sonnet` |
| `PLATFORM_AI_PROVIDER` | Optional | `openrouter` |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO` | Optional | Stripe Price ID for Pro plan |

---

## 🌐 Environment Separation

The app detects its environment via `APP_ENV` / `NEXT_PUBLIC_APP_ENV` (see `src/lib/env.ts`):

### Local Mode (`APP_ENV=development`)

- Database: **SQLite** (`file:./db/custom.db`)
- Schema: `prisma/schema.prisma` (provider = sqlite)
- AI providers shown: **all 14** (cloud + local: Ollama, LM Studio)
- API keys: stored in `localStorage` for convenience (in addition to server-side encrypted)
- Debug logs: enabled when `AUTH_DEBUG=1`
- Vercel: not used

### Production Mode (`APP_ENV=production`)

- Database: **PostgreSQL** (Neon)
- Schema: `prisma/schema.prod.prisma` (provider = postgresql, selected via `PRISMA_SCHEMA` env var in vercel.json)
- AI providers shown: **cloud only** (Ollama, LM Studio hidden — can't be reached from a Vercel origin)
- API keys: **never** stored in `localStorage` — only the masked key is in the browser; the raw key stays server-side (encrypted in DB)
- Debug logs: disabled
- Vercel: handles build + deploy

### How it works

```ts
// src/lib/env.ts
export const isProduction = APP_ENV === "production";
export const isLocal = APP_ENV === "development";
```

In `providers-store.ts`, the `partialize` function strips `apiKey` before persisting to `localStorage` when `isProduction` is true. The Add Provider dialog filters out local-only presets in production via `getAvailablePresets()`.

---

## 🔐 Authentication Flow

### Sign-in

```
User clicks "Sign in with GitHub"
  ↓ (toast: "Redirecting to GitHub…")
signIn("github", { callbackUrl: "/" })
  ↓
Browser redirects to github.com/login/oauth/authorize?client_id=...
  ↓
User authorizes on GitHub
  ↓
GitHub redirects to /api/auth/callback/github?code=...
  ↓
NextAuth exchanges code for access_token
  ↓
NextAuth creates User + Account rows in DB
  ↓
NextAuth issues JWT (containing user.id, plan, accessToken)
  ↓
Browser redirects to callbackUrl ("/")
  ↓
AuthStateWatcher detects loading → authenticated
  ↓ (toast: "Signed in as {name}")
AppShell renders with UserMenu in topbar
```

### Session

- **Strategy**: JWT (stateless — works on Vercel serverless without a session table)
- **Token contents**: `user.id` (cuid), `user.email`, `user.name`, `user.image`, `plan`, `stripeCustomerId`, `accessToken`, `provider`
- **All API routes** read `session.user.id` via the `requireUserId()` helper — never use email as the user identifier (email is for display only; `User.id` is the Prisma FK target)

### Sign-out

```
User clicks UserMenu → "Sign out"
  ↓
AlertDialog: "Sign out of CodeInsight AI?"
  ↓ (user confirms)
signOut({ callbackUrl: "/", redirect: true })
  ↓ (toast: "Signing out…")
JWT cookie cleared
  ↓
Browser redirects to "/"
  ↓
Landing page shown (public)
```

### Errors

OAuth errors (?error=… in URL — set by NextAuth) are surfaced as toasts by `AuthStateWatcher`:

| Error | Toast message |
|-------|---------------|
| `OAuthSignin` | Could not start GitHub OAuth flow. Please try again. |
| `OAuthCallback` | GitHub OAuth callback failed. Check that the GitHub OAuth App callback URL matches this domain exactly. |
| `Configuration` | Server configuration error. The administrator must set NEXTAUTH_SECRET, GITHUB_ID, and GITHUB_SECRET. |
| `AccessDenied` | You denied the GitHub authorization request. Please try again. |
| (others) | Authentication failed: {error} |

---

## 🤖 AI Provider System

### Two storage tiers

| Tier | Where | What's stored | When used |
|------|-------|---------------|-----------|
| **Server (encrypted)** | `ProviderCredential` table | AES-256-GCM encrypted API key | Always — the canonical source |
| **Client (localStorage)** | `codeinsight-ai-providers` | Masked key + metadata | Local dev only (convenience) |

### Backend API

| Endpoint | Auth | Returns |
|----------|------|---------|
| `GET /api/providers` | Required | List of providers with **masked** keys (e.g. `sk-1••••••••••••abcd`) |
| `POST /api/providers/credentials` | Required | Save provider config (encrypts API key server-side) |
| `DELETE /api/providers/credentials?id=...` | Required | Delete a credential |
| `POST /api/providers/test` | Required | Test connectivity (sends a `ping` to the provider) |

### Chat request flow (production)

```
Client sends: { message, provider: { providerId, label, /* no apiKey */ }, aiMode: "byok" }
  ↓
/api/chat route:
  1. requireUserId() → session.user.id
  2. If no apiKey AND isProduction → look up encrypted credential from DB
     - db.providerCredential.findFirst({ userId, providerId, label, enabled: true })
     - decrypt(encryptedApiKey) → realKey
  3. Build effectiveProvider with realKey
  4. If still no key → fall back to Platform AI (if configured) OR return error
  5. callProvider(effectiveProvider, messages)
```

### Local vs production provider list

| Provider | Local | Production |
|----------|-------|------------|
| OpenRouter | ✅ | ✅ |
| OpenAI | ✅ | ✅ |
| Anthropic (Claude) | ✅ | ✅ |
| Google Gemini | ✅ | ✅ |
| DeepSeek | ✅ | ✅ |
| Groq | ✅ | ✅ |
| Azure OpenAI | ✅ | ✅ |
| Together AI | ✅ | ✅ |
| Fireworks AI | ✅ | ✅ |
| Mistral | ✅ | ✅ |
| xAI (Grok) | ✅ | ✅ |
| Custom (OpenAI-compatible) | ✅ | ✅ |
| **Ollama** | ✅ | ❌ (hidden — can't reach localhost from Vercel) |
| **LM Studio** | ✅ | ❌ (hidden — can't reach localhost from Vercel) |

---

## 🔒 Security Model

### API keys

- **AES-256-GCM** encryption (via `src/lib/crypto.ts`) using a key derived from `NEXTAUTH_SECRET` via `scryptSync`
- Keys are encrypted **before** being written to the database
- Keys are decrypted **only at request time** inside the chat route — never logged, never echoed back
- Frontend receives only **masked** keys (e.g. `sk-1••••••••••••abcd`)
- In production, the raw key is **never** stored in `localStorage` (stripped by the providers-store `partialize` function)

### Authentication

- GitHub OAuth only (no password auth)
- JWT strategy (stateless, scales on Vercel serverless)
- `session.user.id` is the canonical user identifier (cuid) — never use email as a FK
- All API routes use `requireUserId()` helper for authentication
- All multi-tenant queries are scoped by `userId` (analyses, settings, credentials, usage, history)

### Multi-tenancy

Every database query that returns user-owned data is scoped by `userId`:

```ts
// ✅ Correct — scoped to authenticated user
db.analysis.findMany({ where: { userId } })
db.analysis.findUnique({ where: { id } }) // + check row.userId === userId

// ❌ Wrong — leaks other users' data
db.analysis.findMany()
db.analysis.findUnique({ where: { id } })
```

### Rate limiting + quotas

- Plan-based quotas: `PLAN_LIMITS` in `src/lib/billing/usage.ts`
- `checkQuota()` enforced on analysis, chat, and agent task creation
- `incrementUsage()` tracks usage per user per month

### Stripe

- Webhook signature verification (`stripe.webhooks.constructEvent`)
- `client_reference_id` = `userId` (cuid) — not email
- Plan updates are idempotent (webhook can be replayed safely)

---

## 🔌 API Reference

### Core APIs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/analyze` | ✅ | Analyze a repo (sync/async) |
| `POST` | `/api/chat` | — | Chat with AI (supports BYOK + Platform AI) |
| `POST` | `/api/chat/stream` | — | SSE streaming chat |
| `GET` | `/api/agents/status` | — | 12 agents + queue stats |
| `POST` | `/api/agents/execute` | — | Enqueue agent task |
| `POST` | `/api/mission/start` | — | Start autonomous mission |
| `GET` | `/api/mission/stream` | — | SSE mission events |
| `POST` | `/api/terminal/run` | — | Sandboxed shell command |
| `POST` | `/api/git/operation` | — | 20 git operations |
| `POST` | `/api/workflow/autonomous` | — | Full workflow / pair-program |
| `GET` | `/api/report?id=...` | ✅ | Full report (must belong to user) |
| `POST` | `/api/parse` | ✅ | Parse + persist a repo from file contents |
| `GET` | `/api/history` | ✅ | User's analysis history |
| `GET/POST/DELETE` | `/api/settings` | ✅ | User settings (profile, etc.) |
| `GET/POST/DELETE` | `/api/jobs/[id]` | ✅ | Job status + cancellation |

### SaaS APIs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/providers` | ✅ | User's providers (**masked** keys) |
| `POST/DELETE` | `/api/providers/credentials` | ✅ | Encrypted API key CRUD |
| `POST` | `/api/providers/test` | ✅ | Test provider connectivity |
| `GET` | `/api/usage` | ✅ | Usage + limits + quotas |
| `POST` | `/api/billing/checkout` | ✅ | Stripe checkout session |
| `POST` | `/api/billing/portal` | ✅ | Stripe customer portal |
| `POST` | `/api/billing/webhook` | Stripe sig | Stripe webhook handler |
| `POST` | `/api/reset` | ✅ | Delete **current user's** data only |

---

## 📋 Page Audit Matrix

| Page | Local | Production | Auth Required | API Endpoint | Status |
|------|-------|------------|---------------|--------------|--------|
| Home (Landing) | ✅ | ✅ | No | — | ✅ Public |
| Dashboard | ✅ | ✅ | Yes | `/api/history` (scoped) | ✅ Multi-tenant |
| Analyze | ✅ | ✅ | Yes | `/api/analyze` (userId attached) | ✅ Multi-tenant |
| Project Report | ✅ | ✅ | Yes | `/api/report?id=...` (ownership check) | ✅ Multi-tenant |
| AI Chat | ✅ | ✅ | Yes (BYOK) or Pro | `/api/chat`, `/api/chat/stream` | ✅ Encrypted key lookup |
| History | ✅ | ✅ | Yes | `/api/history` (scoped) | ✅ Multi-tenant |
| AI Providers | ✅ (all 14) | ✅ (cloud only) | Yes | `/api/providers` (masked) | ✅ Local hidden in prod |
| Personalities | ✅ | ✅ | Yes | localStorage only | ✅ No server data |
| Mission Control | ✅ | ✅ | Yes | `/api/mission/*` | ✅ Auth on jobs |
| Settings | ✅ | ✅ | Yes | `/api/settings` (scoped) | ✅ Multi-tenant |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Language** | TypeScript 5 (strict) |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) |
| **State** | Zustand (client) + TanStack Query (server) |
| **Database** | Prisma ORM — SQLite (local) + PostgreSQL/Neon (prod) |
| **Auth** | NextAuth.js v4 (GitHub OAuth, JWT strategy) |
| **Billing** | Stripe (subscriptions + checkout + portal + webhooks) |
| **AI** | 14 providers (OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Fireworks, Mistral, xAI, Azure, Ollama, LM Studio, Custom) |
| **Encryption** | AES-256-GCM (via Node `crypto`) |
| **Animation** | Framer Motion |
| **Charts** | Recharts + d3-force |
| **Icons** | Lucide React |
| **Toasts** | Sonner |
| **Deploy** | Vercel (Next.js framework preset) |

---

## 🐛 Troubleshooting

### "Sign in with GitHub" does nothing

- Check `GITHUB_ID` and `GITHUB_SECRET` are set in `.env` (local) or Vercel env vars (prod)
- Check the GitHub OAuth App callback URL matches your domain exactly:
  - Local: `http://localhost:3000/api/auth/callback/github`
  - Prod: `https://your-app.vercel.app/api/auth/callback/github`
- Check `NEXTAUTH_SECRET` is set (random 32+ char string)
- Check `NEXTAUTH_URL` matches your domain
- Open browser DevTools → Console for the toast error (e.g. `Configuration`, `OAuthCallback`)

### Hydration mismatch

If you see "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties":

- The FAQ accordion in the landing page is now a client-only component (`<LandingFAQ/>`) — it renders a skeleton during SSR and mounts the interactive accordion after hydration
- The inline SSR script in `layout.tsx` sets `<html>` classes/dataset BEFORE React hydrates (intentional — for theme + i18n)
- All components avoid `Math.random()`, `Date.now()`, and `useId()` in SSR paths

### AI Provider doesn't work in production

- Local providers (Ollama, LM Studio) are hidden in production — they can't be reached from a Vercel origin
- If you saved a provider locally then deployed, the saved credential (encrypted) is in the local SQLite DB, not Neon. You need to re-add the provider in production.
- In production, the raw API key is never in the browser — only the masked version. The server looks up the encrypted key from the DB at request time.

### Database connection error

- Local: ensure `DATABASE_URL="file:./db/custom.db"` and run `bun run db:push`
- Production: ensure `DATABASE_URL` is the Neon PostgreSQL connection string and run `PRISMA_SCHEMA=prisma/schema.prod.prisma DATABASE_URL="..." bunx prisma db push`
- The schema is `prisma/schema.prisma` (sqlite) for local and `prisma/schema.prod.prisma` (postgresql) for production. The Vercel build picks the prod schema via `PRISMA_SCHEMA` env var.

### "A tree hydrated but some attributes of the server rendered HTML didn't match"

This was caused by Radix Accordion's dynamic `useId()` IDs combined with the inline SSR script. Fixed by replacing the Radix Accordion in the landing FAQ with a custom controlled accordion (`src/components/shared/landing-faq.tsx`) that uses deterministic IDs and only mounts after hydration.

---

## 📄 License

**MIT** © [vanhoi04082006-pixel](https://github.com/vanhoi04082006-pixel)

---

<div align="center">

**Built with ❤️ for developers who want AI that ships code, not just suggests it.**

⭐ Star this repo if it's useful!

[Report Bug](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Request Feature](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Discussions](https://github.com/vanhoi04082006-pixel/CodeInsightAI/discussions)

</div>
