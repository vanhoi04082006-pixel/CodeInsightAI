# Deployment Guide

## Prerequisites

- GitHub account (for OAuth + repo analysis)
- Vercel account (for hosting)
- Neon PostgreSQL account (for production database)
- AI provider API key (ShopAIKey recommended, or any OpenAI-compatible provider)

## 1. Database Setup (Neon PostgreSQL)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string
3. Set as `DATABASE_URL` in Vercel env vars

## 2. GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Set:
   - Application name: `CodeInsight AI`
   - Homepage URL: `https://your-app.vercel.app`
   - Authorization callback URL: `https://your-app.vercel.app/api/auth/callback/github`
3. Copy Client ID and Client Secret

## 3. Vercel Deployment

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Select your repository
4. Set Environment Variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://...` (from Neon) |
| `NEXTAUTH_SECRET` | Random string (use `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `GITHUB_ID` | GitHub OAuth Client ID |
| `GITHUB_SECRET` | GitHub OAuth Client Secret |
| `ADMIN_EMAIL` | Your email (optional — first user auto-promoted) |

5. Deploy — `vercel.json` automatically runs:
   ```
   prisma generate --schema prisma/schema.prod.prisma
   prisma db push --schema prisma/schema.prod.prisma --accept-data-loss
   next build
   ```

## 4. Platform AI Configuration (Post-Deploy)

1. Sign in with GitHub (first user auto-promoted to admin)
2. Go to Admin → AI Configuration
3. Add a Platform AI provider (e.g., ShopAIKey):
   - Provider: ShopAIKey
   - API Key: Your key
   - Models: `gpt-4o-mini, claude-3-haiku, deepseek-chat`
4. Set as default provider

## 5. Local Development

```bash
# Clone
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install
bun install

# Environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL=file:./dev.db
#   NEXTAUTH_SECRET=any-random-string
#   GITHUB_ID=your-dev-oauth-id
#   GITHUB_SECRET=your-dev-oauth-secret

# Database
bun run db:push

# Start
bun run dev
```

## 6. Environment Variables Reference

| Variable | Required | Description |
|----------|:---:|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL (prod) or SQLite file (dev) |
| `NEXTAUTH_SECRET` | ✅ | Random string for JWT encryption |
| `NEXTAUTH_URL` | ✅ | App URL (localhost:3000 or vercel.app) |
| `GITHUB_ID` | ✅ | GitHub OAuth Client ID |
| `GITHUB_SECRET` | ✅ | GitHub OAuth Client Secret |
| `ADMIN_EMAIL` | ❌ | Auto-promote this user to admin (first user auto-promoted if not set) |
| `PLATFORM_AI_API_KEY` | ❌ | Platform AI provider key (configurable via admin UI) |
| `PLATFORM_AI_PROVIDER` | ❌ | Default: `shopaikey` |
| `PLATFORM_AI_BASE_URL` | ❌ | Default: `https://api.shopaikey.com/v1` |
| `PLATFORM_AI_MODEL` | ❌ | Default: model from provider preset |
| `STRIPE_SECRET_KEY` | ❌ | Stripe billing (optional) |
| `STRIPE_WEBHOOK_SECRET` | ❌ | Stripe webhook verification |

## 7. Troubleshooting

### Database schema out of sync
```bash
bun run db:push
# On Vercel: redeploy (vercel.json auto-runs db push)
```

### AI passes timing out (504)
- Use faster model (gpt-4o-mini instead of gpt-4o)
- Reduce issues in prompt (already limited to top 5 by severity)
- Increase timeout in provider config

### "Admin only" error
- First user to sign in is auto-promoted to admin
- Or set `ADMIN_EMAIL` env var to your GitHub email

### GitHub OAuth callback error
- Ensure callback URL matches exactly: `https://your-app.vercel.app/api/auth/callback/github`
- For local dev: `http://localhost:3000/api/auth/callback/github`
