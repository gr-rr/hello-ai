# Parallel Agent Workflow (Agent of Empires)

Parallel OpenCode agents are managed by [Agent of Empires](https://github.com/agent-of-empires/agent-of-empires) (`aoe`), a tmux + git-worktree session manager. It replaces the old `spawn_agent.sh` / `orchestrate.sh` scripts.

## Install

```
brew install aoe
```

## One-time repo setup

Config lives in `.agent-of-empires/config.toml` (committed):

- `default_tool = "opencode"` — every session runs OpenCode
- `worktree.enabled = true` — each session gets its own git worktree + branch
- `on_create` / `on_launch` hooks — `npm ci` + copy `.env.local` so MSW-backed dev works in each worktree

## Daily use — run from a real terminal (needs a TTY)

Launch the dashboard TUI:

```
aoe
```

Spawn one agent per task, each isolated in its own worktree + branch:

```
aoe add . -t m2-analysis   -c opencode -w feat/m2-analysis   -b -l
aoe add . -t m3-library    -c opencode -w feat/m3-library    -b -l
```

Flags: `-t` title, `-c opencode` agent, `-w <branch>` worktree branch, `-b` new branch, `-l` launch now.

Drive / monitor:

```
aoe list                    # all sessions
aoe status                  # waiting / running / idle summary
aoe send <title> "message"  # send a prompt to a running agent
aoe                         # TUI dashboard (attach, watch, approve)
```

Remote/web dashboard (optional):

```
aoe serve                   # http dashboard, prints URL
```

## Merging

When a branch is green, merge it. Prefer GitHub auto-merge so it lands once
required checks pass:

```
gh pr merge <pr_number> --squash --auto
```

For an immediate merge as a repo admin (bypasses the wait, not branch
protection rules):

```
gh pr merge <pr_number> --squash --admin
```

## Notes

- `aoe` needs an interactive terminal for `-l` (launch). Don't run it from a non-TTY context.
- Clean up finished sessions with `aoe remove <title>` (worktrees are removed automatically).
