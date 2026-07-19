# Vercel Deployment Guide

## Prerequisites

1. A [Vercel](https://vercel.com) account
2. A PostgreSQL database (Vercel Postgres, Supabase, Neon, or Railway)

## Step 1: Database Setup

Vercel doesn't support SQLite (serverless filesystem is read-only). Use PostgreSQL.

### Option A: Vercel Postgres (easiest)
1. Go to Vercel Dashboard → Your Project → Storage
2. Create a Postgres database
3. Copy the `DATABASE_URL` from the connection string

### Option B: Supabase (free tier)
1. Go to [supabase.com](https://supabase.com) → Create project
2. Settings → Database → Connection string
3. Copy: `postgresql://user:pass@host:5432/dbname`

### Option C: Neon (serverless Postgres)
1. Go to [neon.tech](https://neon.tech) → Create project
2. Copy the connection string

## Step 2: Switch Prisma to PostgreSQL

```bash
./switch-db.sh postgres
```

This changes `prisma/schema.prisma` from `provider = "sqlite"` to `provider = "postgresql"`.

## Step 3: Set Environment Variables on Vercel

In Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?schema=public` |
| `NEXTAUTH_SECRET` | Generate with: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `GITHUB_ID` | Your GitHub OAuth client ID (optional) |
| `GITHUB_SECRET` | Your GitHub OAuth secret (optional) |

## Step 4: Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or connect your GitHub repo on Vercel dashboard for auto-deploy
```

## Step 5: Push Database Schema

After the first deployment, run:

```bash
# Set DATABASE_URL to your production database
DATABASE_URL="postgresql://..." bun run db:push
```

Or use Vercel CLI:

```bash
vercel env pull .env.production
bun run db:push
```

## Local Development (SQLite)

For local development, keep using SQLite:

```bash
./switch-db.sh sqlite
cp .env.example .env
bun run db:push
bun run dev
```

## Build Commands

Vercel will automatically run:
1. `bun install` (or `npm install`)
2. `prisma generate` (postinstall hook)
3. `next build`

The `build` script is: `prisma generate && next build`

## Troubleshooting

### "PrismaClientInitializationError"
- Ensure `DATABASE_URL` is set correctly on Vercel
- Ensure schema is switched to `postgresql`: `./switch-db.sh status`

### "NEXTAUTH_URL mismatch"
- Set `NEXTAUTH_URL` to your Vercel deployment URL

### "GitHub OAuth callback mismatch"
- Update GitHub OAuth app callback URL to:
  `https://your-app.vercel.app/api/auth/callback/github`

### Build fails on Vercel
- Check that all env vars are set
- Run `bun run lint` and `npx tsc --noEmit` locally first
- Check Vercel build logs for specific errors
