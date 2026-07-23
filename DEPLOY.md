# CodeInsight AI — Production Deployment Guide

This guide takes you from a fresh clone to a live production deployment on Vercel + Neon + Stripe.

**Production URL**: <https://code-insight-ai-six.vercel.app>

---

## Prerequisites

| Service | Purpose | Cost |
|---------|---------|------|
| **Vercel** | Hosting + CDN + serverless functions | Free hobby tier |
| **Neon** | PostgreSQL database | Free tier (0.5 GB) |
| **GitHub OAuth App** | User authentication | Free |
| **Stripe** (optional) | Billing for Platform AI Pro plan | Free (pay per transaction) |
| **OpenRouter** (optional) | Platform AI key (1 key = 100+ models) | Pay per use |

---

## Step 1: Database (Neon PostgreSQL)

1. Go to <https://neon.tech> → Sign up (free)
2. Click **New Project** → name it `codeinsight-ai`
3. Select the region closest to your users (e.g. `ap-southeast-1` for Singapore)
4. After creation, copy the **Connection string**:
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
5. Save this — it's your `DATABASE_URL` for production.

---

## Step 2: GitHub OAuth App

1. Go to <https://github.com/settings/developers> → **New OAuth App**
2. Fill in:
   - **Application name**: CodeInsight AI
   - **Homepage URL**: `https://code-insight-ai-six.vercel.app` (update after first deploy if your URL differs)
   - **Authorization callback URL**: `https://code-insight-ai-six.vercel.app/api/auth/callback/github`
3. After creation:
   - Copy **Client ID** → this is `GITHUB_ID`
   - Click **Generate a new client secret** → copy → this is `GITHUB_SECRET`

> ⚠️ **Important**: The callback URL must match `NEXTAUTH_URL` exactly. If you change the Vercel domain, update both the OAuth App callback AND the `NEXTAUTH_URL` env var.

---

## Step 3: Stripe (optional — for Platform AI billing)

Skip this step if you only want BYOK (free) mode.

1. Go to <https://dashboard.stripe.com> → Sign up
2. Ensure you're in **Test mode** (toggle top right) for development
3. Go to **Products** → **Add product**:
   - Name: `CodeInsight AI Pro`
   - Description: `Platform AI — no API key needed`
   - Price: `$9.00 USD / month` (recurring)
   - After creation → copy **Price ID** (e.g. `price_1xxx...`) → this is `STRIPE_PRICE_PRO`
4. Go to **Developers** → **API Keys** → copy **Secret key** → this is `STRIPE_SECRET_KEY`
5. Go to **Developers** → **Webhooks** → **Add endpoint**:
   - URL: `https://code-insight-ai-six.vercel.app/api/billing/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - After creation → copy **Signing secret** → this is `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Platform AI (optional — for "use our AI" mode)

Skip this step if you only want BYOK mode.

1. Get an OpenRouter API key (recommended — 1 key = 100+ models)
   - Go to <https://openrouter.ai/keys> → Create key
2. The key is used server-side only — it is **never** exposed to the frontend.

Set these env vars (in `.env` for local testing, or Vercel for production):

```
PLATFORM_AI_API_KEY=sk-or-v1-...
PLATFORM_AI_BASE_URL=https://openrouter.ai/api/v1
PLATFORM_AI_MODEL=anthropic/claude-3.5-sonnet
PLATFORM_AI_PROVIDER=openrouter
```

---

## Step 5: Deploy to Vercel

1. Push your code to GitHub (`vanhoi04082006-pixel/CodeInsightAI`)
2. Go to <https://vercel.com> → Sign in with GitHub
3. **Add New** → **Project** → Import `CodeInsightAI` repo
4. **Environment Variables** — add ALL of these (use the values from previous steps):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` (from Step 1) |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://code-insight-ai-six.vercel.app` (your Vercel domain) |
| `GITHUB_ID` | From Step 2 |
| `GITHUB_SECRET` | From Step 2 |
| `APP_ENV` | `production` |
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `PLATFORM_AI_API_KEY` | From Step 4 (optional) |
| `PLATFORM_AI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `PLATFORM_AI_MODEL` | `anthropic/claude-3.5-sonnet` |
| `PLATFORM_AI_PROVIDER` | `openrouter` |
| `STRIPE_SECRET_KEY` | From Step 3 (optional) |
| `STRIPE_WEBHOOK_SECRET` | From Step 3 (optional) |
| `STRIPE_PRICE_PRO` | From Step 3 (optional) |

5. Click **Deploy** → wait 2-3 minutes for the build to complete.

The `vercel.json` build command runs:
```
PRISMA_SCHEMA=prisma/schema.prod.prisma prisma generate && next build
```

This ensures the PostgreSQL schema is used (not the SQLite one for local dev).

---

## Step 6: Push Database Schema to Neon

After the Vercel deploy completes, run this locally with your Neon `DATABASE_URL`:

```bash
# macOS / Linux:
PRISMA_SCHEMA=prisma/schema.prod.prisma \
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" \
bunx prisma db push

# Windows PowerShell:
$env:PRISMA_SCHEMA="prisma/schema.prod.prisma"
$env:DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
bunx prisma db push

# Windows CMD:
set PRISMA_SCHEMA=prisma/schema.prod.prisma
set DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
bunx prisma db push
```

This creates all 11 tables in your Neon database:
- `User`, `Account`, `Session`, `VerificationToken` (NextAuth)
- `Analysis`, `ChatMessage`, `FileSummary` (analysis history)
- `UserSettings` (per-user preferences)
- `ProviderCredential` (encrypted API keys)
- `UsageRecord` (quota tracking)
- `MemoryEntry`, `AgentTask`, `AgentEvent` (agent memory)

---

## Step 7: Verify the deployment

1. Open `https://code-insight-ai-six.vercel.app` → landing page should load
2. Click **Sign in** → GitHub OAuth → should redirect to the dashboard
   - If you see a toast error, check:
     - `Configuration` → `NEXTAUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET` are set
     - `OAuthCallback` → the GitHub OAuth App callback URL matches the Vercel domain exactly
3. Top-right should show your **GitHub avatar + name + plan badge** (UserMenu)
4. Go to **Settings** → **AI tab** → should see AI Mode toggle (BYOK + Platform AI)
5. Try **BYOK**: add a provider with API key → chat should work
6. Try **Platform AI**: click → should redirect to Stripe checkout (if Stripe configured)
7. Go to **Analyze** → paste a repo URL → should start analysis pipeline

---

## Step 8: Update Stripe Webhook URL (if you skipped Step 3.5)

If you created the Stripe webhook endpoint before knowing your final Vercel URL:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Update your webhook endpoint URL to:
   `https://code-insight-ai-six.vercel.app/api/billing/webhook`
3. The signing secret stays the same — no need to update `STRIPE_WEBHOOK_SECRET`.

---

## Local Development (SQLite)

For local development, keep using SQLite — no Postgres needed:

```bash
cp .env.example .env
# Edit .env:
#   DATABASE_URL="file:./db/custom.db"
#   GITHUB_ID="..." (from your local GitHub OAuth App)
#   GITHUB_SECRET="..."
#   NEXTAUTH_URL="http://localhost:3000"
#   APP_ENV="development"
#   NEXT_PUBLIC_APP_ENV="development"

bun install
bun run db:push     # creates SQLite tables (prisma/schema.prisma)
bun run dev
```

Open <http://localhost:3000>.

### Local GitHub OAuth App

Create a **second** GitHub OAuth App for local development:
- **Homepage URL**: `http://localhost:3000`
- **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

Use its `GITHUB_ID` / `GITHUB_SECRET` in your local `.env`. This keeps local and production auth separate.

---

## Environment Variables Reference

### Required (always)

| Variable | Local | Production |
|----------|-------|------------|
| `DATABASE_URL` | `file:./db/custom.db` | `postgresql://...neon.tech/...?sslmode=require` |
| `NEXTAUTH_SECRET` | Any random string | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` | `https://your-app.vercel.app` |
| `GITHUB_ID` | Local OAuth App Client ID | Prod OAuth App Client ID |
| `GITHUB_SECRET` | Local OAuth App Secret | Prod OAuth App Secret |
| `APP_ENV` | `development` | `production` |
| `NEXT_PUBLIC_APP_ENV` | `development` | `production` |

### Optional (for Platform AI / billing)

| Variable | Local | Production |
|----------|-------|------------|
| `PLATFORM_AI_API_KEY` | (empty — use BYOK) | OpenRouter key |
| `PLATFORM_AI_BASE_URL` | `https://openrouter.ai/api/v1` | Same |
| `PLATFORM_AI_MODEL` | `anthropic/claude-3.5-sonnet` | Same |
| `PLATFORM_AI_PROVIDER` | `openrouter` | Same |
| `STRIPE_SECRET_KEY` | (empty — skip billing) | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | (empty) | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO` | (empty) | Stripe Price ID for Pro plan |

### Optional (debugging)

| Variable | Local | Production |
|----------|-------|------------|
| `AUTH_DEBUG` | `1` (verbose NextAuth logs) | (empty — never enable in prod) |

---

## Verification Checklist

After deployment, verify:

### Vercel

- [ ] Build succeeds (check Vercel dashboard → Deployments)
- [ ] All env vars are set (Vercel → Settings → Environment Variables)
- [ ] No `localhost` URLs in the production build (search the deployed page source)
- [ ] No development API keys in the production build

### Database

- [ ] `prisma db push` succeeds against Neon
- [ ] Health endpoint returns `database: "ok"`:
  ```bash
  curl https://code-insight-ai-six.vercel.app/api/health
  ```
- [ ] First GitHub sign-in creates a `User` row + `Account` row in Neon

### Authentication

- [ ] Landing page loads without sign-in
- [ ] Clicking "Sign in" redirects to GitHub
- [ ] After GitHub auth, user is redirected back to the app
- [ ] UserMenu shows avatar + name + plan badge
- [ ] Sign out shows confirmation dialog
- [ ] After sign-out, user returns to landing page

### AI Providers

- [ ] In production, "Add Provider" dialog does NOT show Ollama / LM Studio
- [ ] Saving a provider shows the masked key (not the raw key)
- [ ] Inspecting `localStorage` in production shows NO `apiKey` field (only masked)
- [ ] Testing a provider works (returns latency)

### Billing (if Stripe configured)

- [ ] Clicking "Upgrade to Pro" redirects to Stripe checkout
- [ ] After successful checkout, user's `plan` is updated to `pro`
- [ ] "Manage subscription" link opens Stripe customer portal
- [ ] Canceling subscription in portal reverts user to `free` plan (via webhook)

### Multi-tenancy

- [ ] User A's analyses are NOT visible to User B
- [ ] User A's settings are NOT visible to User B
- [ ] User A's API keys are NOT accessible to User B
- [ ] `/api/reset` only deletes the current user's data (not other users')

---

## SaaS Flow

```
User opens app → Landing (public)
  └─ Clicks "Sign in" → GitHub OAuth (required)
      └─ Dashboard → Settings → AI tab
          ├─ BYOK: enter own API key → FREE, encrypted server-side
          └─ Platform AI: Stripe checkout ($9/mo) → use our AI key
                  └─ Webhook updates user.plan → "pro"
                      └─ User can now toggle "Platform AI" mode in AI tab
                          └─ All AI features use our key (no user key needed)
```

---

## Troubleshooting

### Build fails on Vercel

- Check that `PRISMA_SCHEMA=prisma/schema.prod.prisma` is in `vercel.json`'s `buildCommand`
- Check that `DATABASE_URL` is set in Vercel env vars (Production environment)
- Check the Vercel build logs for the specific error

### Sign-in fails with `Configuration` error

This means NextAuth can't find required env vars. Check:
- `NEXTAUTH_SECRET` is set (not empty)
- `GITHUB_ID` is set
- `GITHUB_SECRET` is set
- `NEXTAUTH_URL` matches your Vercel domain exactly (including `https://`)

### Sign-in fails with `OAuthCallback` error

The GitHub OAuth App callback URL doesn't match. Check:
- GitHub OAuth App → Authorization callback URL = `https://your-app.vercel.app/api/auth/callback/github`
- No trailing slash, no query params, exact match

### Hydration mismatch

The FAQ accordion was the known cause — it's now a client-only component (`<LandingFAQ/>`).
If you see a new hydration error:
- Check for `Math.random()`, `Date.now()`, or `useId()` in SSR paths
- Check that the inline SSR script in `layout.tsx` isn't conflicting with your component
- Use the `<HydrationGuard>` component to delay client-only rendering

### Database connection error in production

- Check `DATABASE_URL` is the Neon connection string (starts with `postgresql://`)
- Check the Neon project is not suspended (free tier sleeps after inactivity)
- Check `sslmode=require` is in the connection string
- Run `PRISMA_SCHEMA=prisma/schema.prod.prisma DATABASE_URL="..." bunx prisma db push` locally to verify

### "No AI provider configured" error in chat

- BYOK mode: add a provider in AI Providers settings + enable it
- Platform AI mode: ensure `PLATFORM_AI_API_KEY` is set on Vercel + the user's plan is `pro`
- Check `/api/providers` returns the saved providers (masked keys)
