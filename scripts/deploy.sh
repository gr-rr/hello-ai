#!/usr/bin/env bash
set -euo pipefail

# Health-gated backend deploy for the Oracle VM.
#
# Flow: pull -> rebuild backend -> wait for /health/ready -> rollback on failure.
# Requires: docker compose, curl, and .env.local with SENTRY_DSN_BACKEND present.

cd "$(dirname "$0")/.."

COMPOSE="${DOCKER_COMPOSE_FILE:-docker-compose.yml}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
HEALTH_URL="${BACKEND_URL}/health/ready"
MAX_WAIT="${HEALTH_TIMEOUT:-60}"

echo "[deploy] pulling latest changes"
git fetch -q
PREV_HEAD="$(git rev-parse HEAD)"
git pull --ff-only

echo "[deploy] rebuilding backend"
docker compose -f "$COMPOSE" up -d --build backend

echo "[deploy] waiting for ${HEALTH_URL} (max ${MAX_WAIT}s)"
elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "[deploy] health check failed after ${MAX_WAIT}s; rolling back to ${PREV_HEAD}" >&2
    git checkout -q "$PREV_HEAD"
    docker compose -f "$COMPOSE" up -d --build backend
    exit 1
  fi
  sleep 2
done

echo "[deploy] healthy: ${PREV_HEAD} -> $(git rev-parse --short HEAD)"
