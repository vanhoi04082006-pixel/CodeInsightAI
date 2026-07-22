#!/bin/bash
# CodeInsight AI — Database Provider Switcher
# Switches Prisma between SQLite (local) and PostgreSQL (Vercel/production)

set -e

SCHEMA="prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "❌ prisma/schema.prisma not found"
  exit 1
fi

case "$1" in
  sqlite)
    echo "📦 Switching to SQLite (local development)..."
    sed -i.bak 's/provider = "postgresql"/provider = "sqlite"/' "$SCHEMA"
    sed -i.bak 's|url = env("DATABASE_URL")|url = env("DATABASE_URL")|' "$SCHEMA"
    # Ensure DATABASE_URL uses file: prefix
    if grep -q 'DATABASE_URL="postgresql' .env 2>/dev/null; then
      sed -i.bak 's|DATABASE_URL="postgresql[^"]*"|DATABASE_URL="file:./db/custom.db"|' .env
      echo "✅ Updated .env: DATABASE_URL=file:./db/custom.db"
    fi
    rm -f "$SCHEMA.bak" .env.bak 2>/dev/null
    echo "✅ Schema: SQLite"
    echo "→ Run: bun run db:push"
    ;;

  postgres)
    echo "🐘 Switching to PostgreSQL (Vercel/production)..."
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
    rm -f "$SCHEMA.bak" 2>/dev/null
    echo "✅ Schema: PostgreSQL"
    echo ""
    echo "⚠️  Make sure DATABASE_URL is set to your PostgreSQL connection string:"
    echo "   DATABASE_URL=\"postgresql://user:pass@host:5432/dbname?schema=public\""
    echo ""
    echo "→ Run: bun run db:push"
    ;;

  status)
    PROVIDER=$(grep 'provider = ' "$SCHEMA" | head -1 | sed 's/.*provider = "//;s/".*//')
    echo "📊 Current database provider: $PROVIDER"
    ;;

  *)
    echo "Usage: ./switch-db.sh [sqlite|postgres|status]"
    echo ""
    echo "Commands:"
    echo "  sqlite    Switch to SQLite (local development)"
    echo "  postgres  Switch to PostgreSQL (Vercel/production)"
    echo "  status    Show current provider"
    exit 1
    ;;
esac
