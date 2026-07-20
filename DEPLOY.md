# Deployment Guide

CodeInsight AI uses **two Prisma schema files**:

| Environment | Schema file | Database |
|-------------|-----------|----------|
| **Local dev** | `prisma/schema.prisma` (SQLite) | Local file `db/local.db` — zero external deps |
| **Vercel / production** | `prisma/schema.prod.prisma` (PostgreSQL) | Neon / Vercel Postgres / any Postgres |

The two schemas share the **same models and fields**. When you edit one, mirror
the change in the other. The Vercel build automatically selects the prod schema.

---

## 1. Run locally (SQLite — offline, zero setup)

```bash
# 1. Clone
git clone https://github.com/<your-user>/CodeInsightAI.git
cd CodeInsightAI

# 2. Install dependencies
bun install
#  or:  npm install

# 3. Configure environment
cp .env.example .env
#   Windows cmd:  copy .env.example .env
#   PowerShell:   Copy-Item .env.example .env
# The default DATABASE_URL="file:./db/local.db" works as-is — SQLite.
# Set NEXTAUTH_SECRET to any long random string.

# 4. Create database tables (Prisma creates db/local.db automatically)
bun run db:push
#  or:  npx prisma db push

# 5. Start the dev server
bun run dev
#  or:  npm run dev
```

Open **http://localhost:3000**.

> All data (analyses, chats, settings) is stored locally in `db/local.db`.
> Nothing is sent to any external service.

### Local environment variables

| Variable | Required | Value |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | `file:./db/local.db` (default in `.env.example`) |
| `NEXTAUTH_SECRET` | ✅ | Random string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ✅ | `http://localhost:3000` |
| `GITHUB_ID` / `GITHUB_SECRET` | ❌ | Only to analyze **private** repos |
| `GOOGLE_ID` / `GOOGLE_SECRET` | ❌ | Optional Google sign-in |

---

## 2. Deploy to Vercel + Neon

Vercel's serverless filesystem is read-only — SQLite doesn't work there.
You need a PostgreSQL database. **Neon** is free and recommended.

### Step 2.1 — Get a Neon database (~2 min)

1. Go to **https://neon.tech** → sign in.
2. Click **Create Project** → name it, pick a region.
3. Copy the **Connection string**:
   ```
   postgresql://USER:PASSWORD@ep-xxxxxx.REGION.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2.2 — Push the repo to GitHub

```bash
git remote add origin https://github.com/<your-user>/CodeInsightAI.git
git push -u origin main
```

### Step 2.3 — Import to Vercel

1. Go to **https://vercel.com** → **Add New → Project**.
2. Import your GitHub repo. Vercel detects Next.js automatically.

### Step 2.4 — Set environment variables

In Vercel → **Project → Settings → Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon connection string (Step 2.1) |
| `NEXTAUTH_SECRET` | Random string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | `https://\<your-project\>.vercel.app` |
| `GITHUB_ID` / `GITHUB_SECRET` | Optional — update callback URL |
| `GOOGLE_ID` / `GOOGLE_SECRET` | Optional |

### Step 2.5 — Deploy

Click **Deploy**. Vercel runs:
1. `bun install`
2. `bun run vercel-build` → generates Prisma client from **PostgreSQL schema** (`prisma/schema.prod.prisma`) → builds Next.js.
3. Deploys serverless functions.

### Step 2.6 — Push the database schema

After the first successful deploy, create the tables in your Neon database:

```bash
# Option A: pull production env, then push schema
vercel env pull .env.vercel
bun run db:push:prod

# Option B: directly with your Neon connection string
DATABASE_URL="postgresql://...your-neon-url..." bun run db:push:prod
```

You only need to do this **once**.

---

## 3. Updating the schema later

When you add/remove/rename a model or field:

```bash
# 1. Edit BOTH schema files:
#    - prisma/schema.prisma        (SQLite — local)
#    - prisma/schema.prod.prisma   (PostgreSQL — prod)
#    Keep the model definitions identical.

# 2. Push to local SQLite:
bun run db:push

# 3. Push to production Postgres:
bun run db:push:prod
```

For formal migrations (recommended for production):

```bash
bun run db:migrate:prod          # creates migration in prisma/migrations/
git add prisma/migrations/
git commit -m "db: add new table"

bun run db:deploy                # apply pending migrations to prod
```

---

## Troubleshooting

### `PrismaClientInitializationError` on Vercel
- Verify `DATABASE_URL` is set in Vercel env vars (Production environment).
- Ensure the Neon project is active (free tier pauses idle databases).
- Connection string must end with `?sslmode=require`.

### `NEXTAUTH_URL` redirect loop
- Set `NEXTAUTH_URL` to your exact Vercel URL, no trailing slash.

### GitHub OAuth callback mismatch
- Update GitHub OAuth App callback to:
  `https://<project>.vercel.app/api/auth/callback/github`

### Build fails on Vercel
- Check that `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` are set.
- Inspect the build log for the failing step.
