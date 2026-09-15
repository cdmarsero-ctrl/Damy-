# Deployment

---

## Before you deploy: the checklist

- [ ] **`AUTH_SECRET` is unique to this environment** and at least 32 characters.
      `openssl rand -base64 48`. Sharing it between staging and production means a
      staging token authenticates against production.
- [ ] `DATABASE_URL` points at a PostgreSQL 14+ instance with TLS enabled.
- [ ] Migrations applied with `npx prisma migrate deploy` (never `db push` in production).
- [ ] Content seeded: `npm run db:seed`. Idempotent, so safe to re-run on each release.
      On Vercel both of these happen in the build — see [Vercel](#vercel).
- [ ] `NODE_ENV=production` — this is what makes auth cookies `Secure`.
- [ ] TLS terminating in front of the app. The `Strict-Transport-Security` header is set
      in `next.config.ts` and is meaningless over plain HTTP.
- [ ] `RATE_LIMIT_*` tuned for your traffic, and [Redis-backed](EXTENDING.md#rate-limiting)
      if you run more than one instance.
- [ ] Database backups configured and a restore actually tested.
- [ ] The demo account is absent. The seed skips it when `NODE_ENV=production` unless
      `SEED_DEMO_USER=true`; verify with
      `SELECT 1 FROM "User" WHERE email = 'demo@lexicon.app'`.

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | PostgreSQL 14+ |
| `AUTH_SECRET` | **yes** | — | ≥ 32 chars, unique per environment |
| `ACCESS_TTL_MINUTES` | no | `30` | Access-token lifetime |
| `REFRESH_TTL_DAYS` | no | `30` | Refresh-token lifetime |
| `OPENAI_API_KEY` | no | `""` | Unset → rules engine, clearly labelled in the UI |
| `OPENAI_MODEL` | no | `gpt-4o` | |
| `OPENAI_BASE_URL` | no | `""` | For any OpenAI-compatible endpoint |
| `RATE_LIMIT_AUTH_PER_MIN` | no | `10` | Per IP |
| `RATE_LIMIT_AI_PER_MIN` | no | `20` | Per user |
| `MIGRATE_PREVIEW` | no | `false` | Vercel only: `true` lets a non-production deployment migrate and seed |
| `NEXT_PUBLIC_APP_NAME` | no | `Lexicon` | |
| `NEXT_PUBLIC_APP_URL` | no | `http://localhost:3000` | Used in metadata |

Validation happens at first access through `src/lib/env.ts`, and a missing or too-short
`AUTH_SECRET` fails loudly with an actionable message rather than starting an insecure
server.

---

## Vercel

1. Import the repository. The framework is detected, and `vercel.json` points the build at
   `scripts/vercel-build.sh` — no overrides to set by hand.
2. Attach a Postgres database — Vercel Postgres, Neon and Supabase all work. Use a
   **pooled** connection string; serverless functions exhaust direct connections quickly.
3. Add the environment variables above, `DATABASE_URL` and `AUTH_SECRET` first.
4. Deploy.

### What the build does

```
DATABASE_URL set, production   →  prisma migrate deploy → db:seed → prisma generate → next build
DATABASE_URL set, preview      →  prisma generate → next build          (migrate/seed skipped)
DATABASE_URL unset             →  prisma generate → next build          (migrate/seed skipped)
```

`migrate deploy` is there because Vercel does not run it by itself, and the seed is
idempotent — it upserts on natural keys, so every release ships content updates without
touching learner progress.

**Previews are skipped deliberately.** Preview deployments inherit whatever `DATABASE_URL`
the project has, so migrating from an unmerged branch would apply that branch's schema to
a database other deployments are using. If a preview environment has a database of its
own, set `MIGRATE_PREVIEW=true` for it.

**A missing `DATABASE_URL` does not fail the build.** You get a deployment and a URL, and
the first request that touches the database returns the error from `src/lib/env.ts` naming
exactly what is unset — more useful than Prisma's `P1012` buried in a build log. The
build itself never needs a reachable database.

To seed by hand instead, drop `npm run db:seed` from the script and run:

```bash
DATABASE_URL="<production url>" npm run db:seed
```

**Function duration.** `/api/ai/writing` declares `maxDuration = 90` and the conversation
endpoint 60. Vercel's Hobby tier caps at 60 s, which is enough for conversation but can
truncate a long writing report; Pro allows up to 300.

---

## Docker

`docker-compose.yml` brings up Postgres and the app together:

```bash
cp .env.example .env    # set AUTH_SECRET
docker compose up -d

docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
```

The app is on `http://localhost:3000`; Postgres is exposed on 5432 for local tooling
(remove that port mapping in production).

The `Dockerfile` is a three-stage build producing a Next.js standalone output that runs as
a non-root user. Standalone output is gated behind `BUILD_STANDALONE=1`, which only the
Docker build sets — elsewhere `npm run start` runs `next start` normally. The final
image carries only the server bundle, static assets, the Prisma schema and the generated
client — no source, no dev dependencies.

### Just the database

If you would rather run the app on the host:

```bash
docker compose up -d db
# DATABASE_URL="postgresql://lexicon:lexicon@localhost:5432/lexicon?schema=public"
```

---

## Self-hosted (systemd + nginx)

```bash
# Build on the host
npm ci
npx prisma generate
npm run build

# Migrate and seed
npx prisma migrate deploy
npm run db:seed
```

`/etc/systemd/system/lexicon.service`:

```ini
[Unit]
Description=Lexicon
After=network.target postgresql.service

[Service]
Type=simple
User=lexicon
WorkingDirectory=/srv/lexicon
EnvironmentFile=/srv/lexicon/.env
ExecStart=/srv/lexicon/node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/lexicon/.next

[Install]
WantedBy=multi-user.target
```

nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name lexicon.example.com;

  ssl_certificate     /etc/letsencrypt/live/lexicon.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/lexicon.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }

  # Long-lived immutable assets
  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

`X-Forwarded-For` matters: the rate limiter reads it to identify clients. Without it,
every request appears to come from the proxy and one abusive client exhausts everyone's
budget.

---

## Database operations

```bash
npx prisma migrate deploy      # apply pending migrations
npx prisma migrate status      # what is pending
npm run db:seed                # ship content updates (idempotent)
```

**Zero-downtime migrations.** Prisma's `migrate deploy` does not lock for additive
changes. For destructive ones (dropping a column, narrowing a type), use the expand-and-
contract pattern: add the new column, deploy code writing both, backfill, deploy code
reading the new one, then drop the old column in a later release.

**Backups.**

```bash
pg_dump --format=custom --file=lexicon-$(date +%F).dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" lexicon-2026-01-15.dump
```

Test the restore. A backup that has never been restored is a hypothesis.

---

## Scaling

**Stateless app tier.** Sessions are cookie-based with server-side refresh records, so any
instance can serve any request. The one caveat is the in-process rate limiter — move it to
Redis before adding a second instance (see
[EXTENDING.md](EXTENDING.md#rate-limiting)).

**Database is the bottleneck.** The queries that grow with usage:

| Query | Mitigation |
|---|---|
| Review queue | Indexed `(userId, dueAt)`; limited to 30 |
| Leaderboard aggregation | Indexed `(userId, createdAt)`. Beyond ~100k users, precompute into a snapshot table hourly |
| Analytics | Indexed and windowed to at most 365 days |

**Connection pooling** is essential on serverless. Use PgBouncer in transaction mode, or
a provider's pooled endpoint, and append `?pgbouncer=true&connection_limit=1` to
`DATABASE_URL`.

---

## Monitoring

Worth alerting on:

| Signal | Why |
|---|---|
| 5xx rate | Baseline is near zero; every unexpected error is logged as `[api] unhandled error` |
| `[ai] request failed` frequency | Provider degradation. The app stays up on the rules engine, so this does *not* show up as an error rate |
| `/api/ai/*` p95 latency | The only endpoints making outbound calls |
| Database connection saturation | The first symptom of a pooling misconfiguration |
| Auth 401 rate | A spike suggests either an expiry misconfiguration or credential stuffing |

The app has no telemetry dependency. Adding Sentry means wrapping the `console.error` in
`src/lib/api.ts#route`.

---

## Health check

There is no dedicated health endpoint. `GET /` returns 200 without touching the database,
which is the right liveness probe. For a readiness probe that verifies the database, add:

```ts
// src/app/api/health/route.ts
import { prisma } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
```

Add `/api/health` to `PUBLIC_PREFIXES` in `src/middleware.ts` so it is not redirected to
the login page.
