# Parallel Agent Workflow — Orchestration Tooling

This repo ships scripts to let the lead agent (`opencode`) spawn many
sub-agents in parallel, each isolated in its own git worktree + tmux
session, each opening its own PR, with a built-in auto-merge mechanism.

## Files

- `scripts/spawn_agent.sh` — creates one worktree + tmux agent.
- `scripts/orchestrate.sh` — reads a task list, spawns all agents, polls PRs, auto-merges.
- `scripts/auto_merge.sh` — merges one PR into `main` (handles branch protection).
- `tasks.example.json` — example task list (do not run real agents from it).

## How to use

1. Create a task list as a JSON array. Each entry is:

   ```json
   { "branch": "feat/my-feature", "title": "Short title", "prompt": "Full agent prompt" }
   ```

2. Make sure you are on a clean `main` with `origin/main` fetched.

3. Run the orchestrator:

   ```bash
   ./scripts/orchestrate.sh --tasks tasks.json
   ```

   This spawns one `tmux` session per entry named `agent-<branch>`, each
   running `opencode` inside `.worktrees/<branch>`. The script then polls
   `gh pr list` / `gh pr status` and auto-merges approved/mergeable PRs.

4. Monitor a running agent:

   ```bash
   tmux attach -t agent-<branch>
   ```

   Detach with `Ctrl-b d`.

5. To spawn a single agent manually:

   ```bash
   ./scripts/spawn_agent.sh feat/my-feature /path/to/prompt.txt
   ```

   It is idempotent: if the worktree already exists it skips creation.

## How auto-merge works

`scripts/auto_merge.sh <pr_number>`:

1. Temporarily **deletes** branch protection on `main`
   (`gh api -X DELETE repos/gr-rr/hello-ai/branches/main/protection`).
2. Checks out `main`, fast-forwards (or merges) the PR branch and pushes.
3. **Restores** protection exactly:

   ```json
   {
     "required_status_checks": {"strict": true, "contexts": ["build"]},
     "enforce_admins": true,
     "required_pull_request_reviews": null,
     "restrictions": null
   }
   ```

## Protection-restore safety

Protection is always restored. `auto_merge.sh` installs a `trap ... EXIT`
so the `PUT` that re-creates protection runs even if the merge or push
fails partway. If the restore itself fails, a `WARN` is printed but the
script continues rather than leaving `main` unprotected silently.

## Notes

- The orchestrator merges only PRs that are `MERGEABLE` and `APPROVED`
  (or already `MERGED`). Adjust the gating in `orchestrate.sh` if your
  review policy differs.
- Never run the example task list against real agents — it contains dummy
  prompts.
