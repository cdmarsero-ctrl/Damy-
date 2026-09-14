#!/usr/bin/env bash
#
# Vercel build.
#
# Two rules the previous inline build command got wrong:
#
#   1. The build must not depend on a reachable database. A deployment whose
#      DATABASE_URL is missing should still build and give you a URL; the
#      runtime error from src/lib/env.ts then names exactly what is unset,
#      which is far more useful than Prisma's P1012 in a build log.
#
#   2. Preview deployments must not migrate or reseed. Previews share whatever
#      DATABASE_URL the project has, so running `migrate deploy` from an
#      unmerged branch would apply that branch's schema to it. Opt in with
#      MIGRATE_PREVIEW=true when a preview has a database of its own.
#
set -euo pipefail

VERCEL_ENV="${VERCEL_ENV:-production}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "▲ DATABASE_URL is not set — skipping migrations and seed."
  echo "  The app will deploy, but every page that reads the database will error."
  echo "  Add it under Project Settings → Environment Variables (use a POOLED"
  echo "  connection string) and redeploy."
elif [ "$VERCEL_ENV" != "production" ] && [ "${MIGRATE_PREVIEW:-}" != "true" ]; then
  echo "▲ $VERCEL_ENV deployment — skipping migrations and seed so an unmerged"
  echo "  branch cannot migrate the database this project shares."
  echo "  Set MIGRATE_PREVIEW=true if this environment has its own database."
else
  npx prisma migrate deploy
  npm run db:seed
fi

npx prisma generate
npx next build
