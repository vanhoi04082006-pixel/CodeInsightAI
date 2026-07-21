# CodeInsight AI — Deployment Guide (SaaS)

## Prerequisites

1. **Neon** account (PostgreSQL) — https://neon.tech
2. **Vercel** account — https://vercel.com
3. **GitHub OAuth App** — https://github.com/settings/developers
4. **Stripe** account (optional, for Platform AI billing) — https://stripe.com
5. **OpenRouter** API key (optional, for Platform AI mode) — https://openrouter.ai

---

## Step 1: Database (Neon PostgreSQL)

1. Go to https://neon.tech → Create project
2. Copy connection string: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
3. Save as `DATABASE_URL`

## Step 2: GitHub OAuth App

1. Go to https://github.com/settings/developers → New OAuth App
2. **Application name**: CodeInsight AI
3. **Homepage URL**: `https://your-app.vercel.app`
4. **Authorization callback URL**: `https://your-app.vercel.app/api/auth/callback/github`
5. Copy Client ID → `GITHUB_ID`
6. Generate Client Secret → `GITHUB_SECRET`

## Step 3: Stripe (optional — for Platform AI billing)

1. Go to https://dashboard.stripe.com → Products
2. Create product "Pro" — $9/month recurring
3. Copy Price ID → `STRIPE_PRICE_PRO`
4. Go to Developers → API Keys → Copy secret key → `STRIPE_SECRET_KEY`
5. Go to Developers → Webhooks → Add endpoint: `https://your-app.vercel.app/api/billing/webhook`
6. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## Step 4: Platform AI (optional — for "use our AI" mode)

1. Get an OpenRouter API key (recommended, 1 key = 100+ models)
2. Set env vars:
   - `PLATFORM_AI_API_KEY` = your OpenRouter key
   - `PLATFORM_AI_BASE_URL` = `https://openrouter.ai/api/v1`
   - `PLATFORM_AI_MODEL` = `anthropic/claude-3.5-sonnet`
   - `PLATFORM_AI_PROVIDER` = `openrouter`

## Step 5: Deploy to Vercel

1. Go to https://vercel.com → New Project → Import GitHub repo
2. Set Environment Variables:

```
DATABASE_URL=postgresql://...neon.tech/...
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://your-app.vercel.app
GITHUB_ID=<from step 2>
GITHUB_SECRET=<from step 2>
STRIPE_SECRET_KEY=<from step 3>
STRIPE_WEBHOOK_SECRET=<from step 3>
STRIPE_PRICE_PRO=<from step 3>
PLATFORM_AI_API_KEY=<from step 4>
PLATFORM_AI_BASE_URL=https://openrouter.ai/api/v1
PLATFORM_AI_MODEL=anthropic/claude-3.5-sonnet
PLATFORM_AI_PROVIDER=openrouter
```

3. Deploy

## Step 6: Push Database Schema

After first deploy, run locally with production DATABASE_URL:

```bash
DATABASE_URL="postgresql://..." bunx prisma db push
```

Or use Vercel CLI:

```bash
npm i -g vercel
vercel env pull .env.production
bunx prisma db push
```

## Step 7: Update GitHub OAuth Callback

After deploy, update GitHub OAuth App callback URL to your Vercel domain:
`https://your-app.vercel.app/api/auth/callback/github`

---

## SaaS Flow

```
User opens app → Landing (public)
Clicks "Sign in" → GitHub OAuth → Dashboard
Settings → AI tab → Two modes:
  BYOK: enter own API key → FREE
  Platform AI: use your key → $9/mo (Stripe checkout)
Analyze repos, chat with AI, Mission Control — all features work in both modes
```

## Local Development (SQLite)

For local dev, keep SQLite:

```bash
cp .env.example .env
# Edit .env: DATABASE_URL="file:./db/custom.db"
bun install
bunx prisma db push
bun run dev
```
