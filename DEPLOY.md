# CodeInsight AI — Deployment Guide (SaaS)

## Prerequisites

1. **Neon** account (PostgreSQL) — https://neon.tech (free tier)
2. **Vercel** account — https://vercel.com (free hobby tier)
3. **GitHub OAuth App** — https://github.com/settings/developers
4. **Stripe** account (optional, for Platform AI billing) — https://stripe.com
5. **OpenRouter** API key (optional, for Platform AI mode) — https://openrouter.ai

---

## Step 1: Database (Neon PostgreSQL)

1. Go to https://neon.tech → Sign up (free)
2. Click **New Project** → name it "codeinsight-ai"
3. Select region closest to you
4. After creation, copy the **Connection string**:
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
5. Save this — it's your `DATABASE_URL`

## Step 2: GitHub OAuth App

1. Go to https://github.com/settings/developers → **New OAuth App**
2. Fill in:
   - **Application name**: CodeInsight AI
   - **Homepage URL**: `http://localhost:3000` (temporary, will update after deploy)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. After creation → copy **Client ID** → `GITHUB_ID`
4. Click **Generate a new client secret** → copy → `GITHUB_SECRET`

## Step 3: Stripe (optional — for Platform AI billing)

1. Go to https://dashboard.stripe.com → Sign up
2. Ensure you're in **Test mode** (toggle top right)
3. Go to **Products** → **Add product**:
   - Name: `CodeInsight AI Pro`
   - Price: `$9.00 USD / month` (recurring)
   - After creation → copy **Price ID** (e.g., `price_1xxx...`) → `STRIPE_PRICE_PRO`
4. Go to **Developers** → **API Keys** → copy **Secret key** → `STRIPE_SECRET_KEY`
5. Go to **Developers** → **Webhooks** → **Add endpoint**:
   - URL: `https://your-app.vercel.app/api/billing/webhook` (update after deploy)
   - Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - After creation → copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

## Step 4: Platform AI (optional — for "use our AI" mode)

1. Get an OpenRouter API key (recommended, 1 key = 100+ models)
2. Set env vars:
   - `PLATFORM_AI_API_KEY` = your OpenRouter key
   - `PLATFORM_AI_BASE_URL` = `https://openrouter.ai/api/v1`
   - `PLATFORM_AI_MODEL` = `anthropic/claude-3.5-sonnet`
   - `PLATFORM_AI_PROVIDER` = `openrouter`

## Step 5: Deploy to Vercel

1. Go to https://vercel.com → Sign in with GitHub
2. **Add New** → **Project** → Import `CodeInsightAI` repo
3. **Environment Variables** — add ALL of these:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` (update after first deploy) |
| `GITHUB_ID` | From Step 2 |
| `GITHUB_SECRET` | From Step 2 |
| `PLATFORM_AI_API_KEY` | From Step 4 (optional) |
| `PLATFORM_AI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `PLATFORM_AI_MODEL` | `anthropic/claude-3.5-sonnet` |
| `PLATFORM_AI_PROVIDER` | `openrouter` |
| `STRIPE_SECRET_KEY` | From Step 3 (optional) |
| `STRIPE_WEBHOOK_SECRET` | From Step 3 (optional) |
| `STRIPE_PRICE_PRO` | From Step 3 (optional) |

4. Click **Deploy** → wait 2-3 minutes

## Step 6: Push Database Schema

After Vercel deploy completes, run locally with your Neon DATABASE_URL:

```bash
# Windows CMD:
set DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
bunx prisma db push

# Windows PowerShell:
$env:DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
bunx prisma db push

# macOS/Linux:
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" bunx prisma db push
```

This creates all 13 tables in your Neon database.

## Step 7: Update GitHub OAuth Callback

After Vercel deploys, you'll get a URL like `https://codeinsight-ai.vercel.app`:

1. Go back to GitHub OAuth App settings
2. Update:
   - **Homepage URL**: `https://your-app.vercel.app`
   - **Authorization callback URL**: `https://your-app.vercel.app/api/auth/callback/github`

## Step 8: Update Stripe Webhook URL

1. Go to Stripe Dashboard → Developers → Webhooks
2. Update your webhook endpoint URL to:
   `https://your-app.vercel.app/api/billing/webhook`

## Step 9: Update NEXTAUTH_URL on Vercel

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Update `NEXTAUTH_URL` to your actual Vercel domain
3. **Redeploy** (Deployments → click latest → Redeploy)

---

## Verification

After all steps, test your deployment:

1. Open `https://your-app.vercel.app` → landing page should load
2. Click **Sign in** → GitHub OAuth → should redirect to dashboard
3. Go to **Settings** → **AI tab** → should see AI Mode toggle (BYOK + Platform AI)
4. Try **BYOK**: add a provider with API key → chat should work
5. Try **Platform AI**: click → should redirect to Stripe checkout (if configured)
6. Go to **Analyze** → paste a repo URL → should start analysis pipeline

---

## SaaS Flow

```
User opens app → Landing (public)
Clicks "Sign in" → GitHub OAuth → Dashboard
Settings → AI tab → Two modes:
  BYOK: enter own API key → FREE, unlimited
  Platform AI: Stripe checkout ($9/mo) → use our AI key
Analyze repos, chat with AI, Mission Control — all features work in both modes
```

---

## Local Development (SQLite)

For local development, keep using SQLite:

```bash
cp .env.example .env
# Edit .env: DATABASE_URL="file:./db/custom.db"
bun install
bunx prisma db push
bun run dev
```

Open `http://localhost:3000`.

Note: Local mode doesn't require GitHub login (auth gate only applies in production).
