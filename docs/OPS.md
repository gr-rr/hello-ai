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

The backend currently has **no GitHub Actions deploy**. Changes are picked up only when the
container is rebuilt on the VM (see Deploy). This is the #1 cause of "my BE change didn't
show up" — rebuild before concluding the code is wrong.

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

## Logs

- Backend emits **structured JSON** to stdout: `{ts, level, logger, msg, req_id, ...}`.
  Every HTTP request gets a `x-request-id` (echoed in the response header) so you can
  correlate a user-facing error to the exact log line.
- View live: `docker compose logs -f backend`.
- Opt-in Grafana/Loki (recommended for the VM):

  ```bash
  docker compose -f docker-compose.observability.yml up -d
  # Grafana on http://<vm>:3001  (admin / $GRAFANA_PASSWORD, default "admin")
  # Loki datasource is auto-provisioned; query: {container="music-ai-backend"}
  ```

## Health

| Endpoint | Meaning |
|---|---|
| `GET /health` | Liveness — always `ok`. |
| `GET /health/live` | Liveness alias. |
| `GET /health/ready` | Readiness — `supabase: true/false`. Returns `degraded` if Supabase is unconfigured. Used by the deploy gate. |

## Restart / rollback

```bash
docker compose up -d --build backend     # restart with latest code
docker compose restart backend           # restart without rebuild
git checkout <prev_commit> && ./scripts/deploy.sh   # manual rollback
```

## Errors (Sentry)

- Backend exceptions are captured by `sentry-sdk` (FastAPI/Starlette integration).
  Verify the backend DSN is set: `docker compose exec backend printenv SENTRY_DSN_BACKEND`.
- Frontend client + server + edge Sentry are wired in `instrumentation.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`, and `app/global-error.tsx`.

## Known gaps (tracked)

- No CI deploy pipeline — deploys are manual on the VM.
- `docker-compose.yml` backend runs with `--reload` (dev). Production should use
  `--workers 2` (or gunicorn) without `--reload`; see `scripts/deploy.sh`.
- No metrics/OpenTelemetry yet — Sentry traces cover request latency; add OTel → Grafana
  Tempo later if needed.
