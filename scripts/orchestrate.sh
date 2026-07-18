#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPAWN_SCRIPT="${REPO_ROOT}/scripts/spawn_agent.sh"
AUTO_MERGE_SCRIPT="${REPO_ROOT}/scripts/auto_merge.sh"
REPO="gr-rr/hello-ai"

usage() {
  echo "Usage: $0 --tasks <tasks.json>" >&2
  exit 1
}

TASKS_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tasks) TASKS_FILE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if [[ -z "${TASKS_FILE}" || ! -f "${TASKS_FILE}" ]]; then
  echo "ERROR: --tasks file '${TASKS_FILE}' not found" >&2
  exit 1
fi

spawn_one() {
  local branch="$1" title="$2" prompt="$3"
  local task_file
  task_file="$(mktemp -t "task-${branch}-XXXX.txt")"
  {
    echo "TASK: ${title}"
    echo
    echo "${prompt}"
    echo
    echo "When done, push your branch and open a PR against main, then stop."
  } > "${task_file}"
  bash "${SPAWN_SCRIPT}" "${branch}" "${task_file}"
}

echo "Spawning agents from '${TASKS_FILE}'"
branch_list="$(jq -r '.[].branch' "${TASKS_FILE}")"

while IFS= read -r branch; do
  [[ -z "${branch}" ]] && continue
  title="$(jq -r --arg b "${branch}" '.[] | select(.branch==$b) | .title' "${TASKS_FILE}")"
  prompt="$(jq -r --arg b "${branch}" '.[] | select(.branch==$b) | .prompt' "${TASKS_FILE}")"
  spawn_one "${branch}" "${title}" "${prompt}"
done <<< "${branch_list}"

echo "All agents spawned. Monitoring PR status..."
while true; do
  pending="$(gh pr list --repo "${REPO}" --state open --json number,headRefName,mergeable --jq '.[] | select(.mergeable=="MERGEABLE") | .number')"
  if [[ -z "${pending}" ]]; then
    echo "No mergeable open PRs remaining. Done."
    break
  fi
  for pr in ${pending}; do
    state="$(gh pr status --repo "${REPO}" --json reviews,state --jq ".[] | select(.number==${pr}) | .state" 2>/dev/null || echo "")"
    echo "PR #${pr} state: ${state:-unknown}"
    if [[ "${state}" == "APPROVED" || "${state}" == "MERGED" ]]; then
      echo "Auto-merging PR #${pr}"
      bash "${AUTO_MERGE_SCRIPT}" "${pr}" || echo "WARN: auto-merge failed for PR #${pr}"
    fi
  done
  sleep 30
done
