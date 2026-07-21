# Redesign Proposal — Scalability & Reliability

The current system works for a solo dev on a single VM, but it has structural
risks that will bite as usage grows. This doc lays out the current risks, a target
architecture, and a phased roadmap to get there. It is deliberately scoped — see
[YAGNI](#yagni-deliberately-skip) for what we are intentionally *not* doing.

## Current risks

- **Blocking inference in the request path.** `POST /music/transcribe` runs
  `transcribe_audio` synchronously, so a single slow job ties up a request worker.
- **Fragile training.** FastAPI `BackgroundTasks` + a process-local `_training_slot`
  lock. The lock dies on restart and is not shared across replicas, so LoRA
  fine-tuning state is lost on every deploy and can't scale horizontally.
- **HTTP 413 from the host proxy.** The host-level reverse proxy enforces a ~1MB
  request body limit, but there is **no in-repo proxy config**, so the limit is
  invisible and unversioned. Large uploads to `/api/music/analyze` fail with 413.
- **Single Oracle VM = SPOF.** No redundancy; one host down = backend down.
- **Prod runs `uvicorn --reload`.** A dev flag left in production; should be
  `--workers 2` (or more behind a queue).
- **Secrets partly in `.env.local`.** Some secrets live in a committed-adjacent
  file rather than a vault.
- **Partial observability.** Logs + `x-request-id` only. No metrics, tracing, or
  alerting yet.

## Target architecture

```
Browser / Vercel
      │  in-repo Caddy (ACME TLS + request_body { max_size 100MB })
      ▼
Stateless backend replicas
      │  Redis + RQ queue
      ▼
Workers (distributed training lock via Redis)
      │
      ├── Supabase (jobs table = status source of truth)
      ├── Loki / Grafana (logs)
      ├── Prometheus + fastapi-instrumentator (/metrics)
      ├── OpenTelemetry (traces)
      └── Sentry (alerts)
```

Key moves:

- **In-repo Caddy** with `request_body { max_size 100MB }` and automatic ACME TLS,
  replacing the invisible host proxy limit. The body-limit policy becomes
  version-controlled.
- **Stateless backend replicas** behind the proxy; no per-process state.
- **Redis + RQ** queue so `transcribe` / fine-tune jobs run async in workers,
  freeing request workers.
- **Distributed training lock** in Redis, replacing `_training_slot`.
- **`jobs` table as the sole status source of truth** (already in Supabase),
  polled or pushed via SSE.
- **Full observability:** Prometheus + `fastapi-instrumentator` exposing `/metrics`,
  OpenTelemetry tracing, Loki/Grafana logs, Sentry alerts, and an uptime probe.

## Phased roadmap

**Phase 0 — quick wins (no behavior change)**
- Add an in-repo `Caddyfile` (body limit + TLS).
- Switch uploads to **browser signed-upload to Supabase**, then pass
  `library_path` to the backend (removes the large-body proxy problem entirely).
- Kill `--reload` → `--workers 2`.
- Expose `/metrics` + a Grafana dashboard.
- Add a GitHub Action uptime probe.

**Phase 1 — async jobs**
- Introduce Redis + RQ.
- Replace `_training_slot` with a Redis distributed lock.
- Status polling / SSE backed by the `jobs` table as the only source of truth.

**Phase 2 — multi-replica + IaC**
- Run multiple stateless replicas.
- Terraform (OCI) for reproducible infra.
- Separate env (dev/staging/prod) + a secrets vault.
- pgbouncer in front of Supabase Postgres.

**Phase 3 — full observability + delivery**
- Metrics/tracing/alerting wired to on-call.
- Per-PR preview backends.
- Blue-green / canary deploys.

## YAGNI (deliberately skip)

- Kubernetes
- Celery / RabbitMQ
- Multi-region
- Service mesh
- Custom ML serving stack
- A separate job database (reuse the existing Supabase `jobs` table)
