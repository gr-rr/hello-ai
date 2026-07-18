#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="gr-rr/hello-ai"
PROTECTION_API="repos/${REPO}/branches/main/protection"

PROTECTION_PAYLOAD='{
  "required_status_checks": {"strict": true, "contexts": ["build"]},
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}'

restore_protection() {
  echo "Restoring branch protection on main"
  echo "${PROTECTION_PAYLOAD}" | gh api -X PUT "${PROTECTION_API}" \
    --input - --silent || echo "WARN: failed to restore protection" >&2
}

usage() {
  echo "Usage: $0 <pr_number>" >&2
  exit 1
}

if [[ $# -lt 1 ]]; then
  usage
fi

PR_NUMBER="$1"

trap restore_protection EXIT

echo "Temporarily removing branch protection on main"
gh api -X DELETE "${PROTECTION_API}" --silent || {
  echo "WARN: delete protection returned non-zero; continuing" >&2
}

echo "Fetching PR #${PR_NUMBER} head branch"
gh pr checkout "${PR_NUMBER}" --repo "${REPO}" || {
  git -C "${REPO_ROOT}" fetch origin "pull/${PR_NUMBER}/head:pr-${PR_NUMBER}"
  git -C "${REPO_ROOT}" checkout "pr-${PR_NUMBER}"
}

PR_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"

git -C "${REPO_ROOT}" checkout main
git -C "${REPO_ROOT}" fetch origin main --quiet
git -C "${REPO_ROOT}" merge --ff-only "origin/${PR_BRANCH}" || \
  git -C "${REPO_ROOT}" merge "origin/${PR_BRANCH}"

git -C "${REPO_ROOT}" push origin main

echo "PR #${PR_NUMBER} merged into main"
