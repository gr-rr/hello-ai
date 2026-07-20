# Operations Runbook

How to run, observe, and recover the backend on the Oracle VM.

## Topology

```
Browser / Vercel (Next.js)
        │  /api/* proxy
        ▼
Oracle VM  ── docker compose ──► backend (FastAPI :8000)
        │                              │
        │                              ├── Sentry (errors + traces)
        │                              └── JSON stdout logs
        │
        └── observability stack (opt-in)
              Loki ◄── Promtail ◄── container logs
              Grafana (dashboards)
```

Backend deploys run via `deploy-backend.yml` (on push to `main` for `backend/**`) and
via `scripts/deploy.sh` on the VM. Changes are only live once the container is rebuilt on
the VM (see Deploy) — rebuild before concluding a BE change "didn't show up".

## Environment

Set on the VM via `.env.local` (the backend container reads these):

| Var | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB + Storage access |
| `SENTRY_DSN_BACKEND` | Backend errors/traces (falls back to `SENTRY_DSN`) |
| `SENTRY_ENV` | `production` on the VM, `development` locally |
| `RELEASE` | e.g. `backend@1.2.3` (shows in Sentry) |

Frontend Sentry uses `NEXT_PUBLIC_SENTRY_DSN` (separate, in the Vercel build).

## Deploy (health-gated)

```bash
# on the VM, inside the repo
./scripts/deploy.sh
```

The script pulls, rebuilds the backend container, polls `GET /health/ready`, and
**auto-rolls back to the previous commit** if the backend is not healthy within
`HEALTH_TIMEOUT` seconds (default 60). Always tail logs after a deploy.

## Restart / rollback

```bash
docker compose up -d --build backend     # restart with latest code
docker compose restart backend           # restart without rebuild
git checkout <prev_commit> && ./scripts/deploy.sh   # manual rollback
```

# Monitoring & Status — where do I look?
All reachable by a human without touching code. Commands run from your machine unless marked 'on the VM'.

## Sentry (errors + traces)
Two Sentry setups, both env-gated (silent if DSN empty):
- Frontend: `NEXT_PUBLIC_SENTRY_DSN` (Vercel project vars + `.env.local`).
- Backend: `SENTRY_DSN_BACKEND` (falls back to `SENTRY_DSN`); set in `.env.local` on the VM (`docker-compose.yml:83`).
Verify on VM: `docker compose exec backend printenv SENTRY_DSN_BACKEND` and `docker compose logs backend | grep sentry_initialized`.
A DSN looks like `https://<key>@<org>.<region>.ingest.sentry.io/<project_id>`. To reach the dashboard: open https://sentry.io/ → org switcher → your org → **Issues** (exceptions) and **Performance/Traces** (latency). The org slug + project names are NOT in the repo — derive from `.env.local` DSN or your Sentry account. Backend releases tagged via `RELEASE` (default `backend@0.2.0`).

## Logs (Loki / Promtail / Grafana)
Backend emits structured JSON to stdout (`{ts,level,logger,msg,req_id}` + `exc` on errors; per-request `{req_id,method,path,status,duration_ms}`). Every request gets `x-request-id` echoed in the response header — copy it to find the exact log line.
Live tail (always works, on VM): `docker compose logs -f backend`.
Grafana/Loki are opt-in: `docker compose -f docker-compose.observability.yml up -d` → Grafana on `:3001`, Loki `:3100`. If `3001` isn't reachable, `ssh -L 3001:localhost:3001 <vm-user>@<vm-ip>` then open http://localhost:3001 (admin / `$GRAFANA_PASSWORD`). Query Loki: `{container="music-ai-backend"} |= "request_failed"` or `|= "req_id=abc123"`.

## Health (is the backend up?)
`curl https://gricci-testing.duckdns.org/health/live` → `{"status":"alive"}`; `/health/ready` → `{"status":"ready","supabase":true}`. First thing to check after a deploy; `ready` returns `degraded` + `supabase:false` if env vars missing.

## CI (did my PR break anything?)
Repo → Actions tab. Workflows: `build.yml` (build+vitest, blocks), `ci.yml` (lint+typecheck+ruff+pytest, blocks), `e2e.yml` (Playwright vs mocks, blocks), `argos.yml` (visual, NON-blocking), `codeql.yml`, `gitleaks.yml`, `dependency-review.yml`, `deploy-backend.yml` (push only).

## Argos (visual diffs)
`https://app.argos-ci.com` (needs `ARGOS_TOKEN` repo secret); also comments a visual diff on each PR. Non-blocking by design.

## Supabase (storage/DB/auth/RLS)
Dashboard from `.env.local` `SUPABASE_URL` (`https://<ref>.supabase.co` → supabase.com/dashboard/project/<ref>). Check buckets, `jobs`/`models` tables, Auth users, RLS policies (`supabase/migrations/`).

## Links to add (owner-only — paste from your accounts, never commit tokens)
- [ ] Sentry org slug + frontend/backend project URLs
- [ ] Supabase project dashboard URL
- [ ] Grafana base URL / VM IP (and whether 3001 is exposed)
- [ ] Argos project URL
- [ ] Backend public URL for health curls
