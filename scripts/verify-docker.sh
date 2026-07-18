#!/usr/bin/env bash
set -uo pipefail

echo "=== Docker Dev Environment Verification ==="
echo ""

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" &>/dev/null; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "--- Toolchain ---"
check "Node"              node --version
check "Python 3"          python3 --version
check "pnpm"              pnpm --version
check "Git"               git --version
check "uv"               uv --version
check "Playwright"        npx playwright --version
check "OpenCode CLI"      opencode --version
check "Supabase CLI"      supabase --version

echo ""
echo "--- Git ---"
check "Git status"        git status
check "Git config"        git config user.name
check "Git remote"        git remote -v
check "Git remote reachable"  git remote -v | grep -q "upstream\|origin"

echo ""
echo "--- Environment Variables ---"
check "GITHUB_TOKEN"       [ -n "${GITHUB_TOKEN:-}" ]
check "SUPABASE_URL"       [ -n "${SUPABASE_URL:-}" ]
check "SENTRY_DSN"         [ -n "${SENTRY_DSN:-}" ]
check "SENTRY_ACCESS_TOKEN" [ -n "${SENTRY_ACCESS_TOKEN:-}" ]
check "OPENAI_API_KEY or OPENROUTER_API_KEY"  [ -n "${OPENAI_API_KEY:-}" -o -n "${OPENROUTER_API_KEY:-}" ]

echo ""
echo "--- Docker ---"
check "Docker socket"      docker ps
check "Can build"          docker build -t test-verify -f Dockerfile . --quiet

echo ""
echo "--- Filesystem ---"
check "Project is /workspace"  [ "$PWD" = "/workspace" ]
check "node_modules volume"    [ -d node_modules ] && [ -f package.json ]
check "Python backend"         [ -f backend/main.py ]
check "Next.js app"            [ -f app/page.tsx ]

echo ""
echo "--- MCP Configuration ---"
check "opencode.json exists"   [ -f opencode.json ]

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
