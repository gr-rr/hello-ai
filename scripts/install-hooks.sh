#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
echo "Installing pre-commit hooks in $HOOKS_DIR …"

# Gitleaks pre-commit hook — scans staged files for secrets.
cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Running Gitleaks secret scan …"

if ! command -v gitleaks &>/dev/null; then
  echo "⚠️  gitleaks not found — skipping. Install: brew install gitleaks"
  exit 0
fi

gitleaks protect --staged --no-banner 2>&1
HOOK

chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Hooks installed: $HOOKS_DIR/pre-commit"
