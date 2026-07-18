#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }

echo "══════════════════════════════════════════"
echo "  hello-ai — full check"
echo "══════════════════════════════════════════"
echo ""

# ── Frontend ──────────────────────────────────
echo "── Frontend build ──"
if npm run build 2>/dev/null; then pass "build"; else fail "build"; fi

echo ""
echo "── Frontend lint ──"
if npm run lint 2>/dev/null; then pass "lint"; else fail "lint"; fi

# ── Backend ───────────────────────────────────
echo ""
echo "── Backend (Python) ──"
if command -v ruff &>/dev/null; then
  if ruff check backend/ && ruff format backend/ --check; then
    pass "ruff"
  else
    fail "ruff"
  fi
else
  echo "  ⚠️  ruff not installed — skipping (pip install ruff)"
fi

echo ""
echo "── Backend tests ──"
if python -m pytest backend/tests/ -v 2>/dev/null; then
  pass "pytest"
else
  fail "pytest"
fi

echo ""
echo "── Frontend tests ──"
if npm test 2>/dev/null; then
  pass "vitest"
else
  fail "vitest"
fi

echo ""
echo "── Backend health ──"
BE_URL="${MUSIC_BACKEND_URL:-}"
if [ -n "$BE_URL" ]; then
  if health=$(curl -sf "$BE_URL/health/live" 2>/dev/null); then
    pass "health/live ($health)"
  else
    fail "health/live (unreachable)"
  fi
  if health=$(curl -sf "$BE_URL/health/ready" 2>/dev/null); then
    pass "health/ready ($health)"
  else
    fail "health/ready (unreachable)"
  fi
else
  echo "  ⚠️  MUSIC_BACKEND_URL not set — skipping health check"
fi

# ── E2E ───────────────────────────────────────
echo ""
echo "── Playwright E2E ──"
if npx playwright test --reporter=line 2>/dev/null; then
  pass "e2e"
else
  fail "e2e"
fi

echo ""
echo "══════════════════════════════════════════"
echo "  $PASS passed, $FAIL failed"
echo "══════════════════════════════════════════"
exit $FAIL
