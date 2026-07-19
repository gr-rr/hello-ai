#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREES_DIR="${REPO_ROOT}/.worktrees"
REPO="gr-rr/hello-ai"

usage() {
  echo "Usage: $0 <branch_name> <task_file>" >&2
  echo "  branch_name  git branch (and worktree dir) to create from origin/main" >&2
  echo "  task_file    path to a file containing the agent prompt" >&2
  exit 1
}

if [[ $# -lt 2 ]]; then
  usage
fi

BRANCH="$1"
TASK_FILE="$2"
WORKTREE_PATH="${WORKTREES_DIR}/${BRANCH}"
SESSION_NAME="agent-${BRANCH}"

if [[ ! -f "${TASK_FILE}" ]]; then
  echo "ERROR: task file '${TASK_FILE}' not found" >&2
  exit 1
fi

mkdir -p "${WORKTREES_DIR}"

if [[ -d "${WORKTREE_PATH}" ]]; then
  echo "SKIP: worktree '${WORKTREE_PATH}' already exists"
else
  echo "Creating worktree '${WORKTREE_PATH}' on branch '${BRANCH}' from origin/main"
  git -C "${REPO_ROOT}" fetch origin main --quiet
  git -C "${REPO_ROOT}" worktree add "${WORKTREE_PATH}" -b "${BRANCH}" "origin/main"
fi

echo "Launching tmux session '${SESSION_NAME}' running opencode"
tmux new-session -d -s "${SESSION_NAME}" \
  "opencode --workdir ${WORKTREE_PATH} -p ${TASK_FILE}"

echo "${SESSION_NAME}"
