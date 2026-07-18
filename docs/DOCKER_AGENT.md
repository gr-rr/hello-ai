# Docker Agent — Quick Start

## Enter the container

```bash
cd ~/hello-ai && docker compose run --rm opencode
```

## Verify everything works

```bash
bash scripts/verify-docker.sh
```

## Load env vars

Already loaded from `.env.local` by Docker Compose. Check:

```bash
env | grep -E 'SUPABASE|SENTRY|GITHUB|OPENAI|OPENROUTER'
```

Missing something? Edit `.env.local` on the host — it's bind-mounted.

## Start services

| What | Command |
|---|---|
| Next.js dev server | `npm run dev` |
| FastAPI backend | `pip install -r backend/requirements.txt && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` |
| Run tests | `npm test` (Vitest) + `python -m pytest backend/tests/ -v` (pytest) |
| E2E tests | `npx playwright test --reporter=line` |
| Build check | `npm run build` |

## Start OpenCode

```bash
opencode
```

## Common issues

| Problem | Fix |
|---|---|
| `env: command not found` | Use `printenv` instead |
| `npm run dev` can't find modules | `npm install` |
| Docker socket denied | Host needs to allow Docker Desktop access |
| File permission errors | Run `sudo chown -R 501:501 .` inside container |

## Git workflow (same as host)

```bash
git status
git add -A && git commit -m "message"
git push
gh pr create
```

## Exiting

```bash
exit  # leaves the container
```

## Oracle VM later

Same compose file. Just:

```bash
cd ~/hello-ai && docker compose run --rm opencode
```
