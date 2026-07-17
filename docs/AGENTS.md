# Agent SOT — hello-ai·music-studio

This file is the Source of Truth for AI coding agents working on this
project. Read it before making any changes.

## Overview

This project uses a 5-role autonomous development loop. Each role has
a defined SOP and produces a concrete artifact. See `docs/AGENT_ROLES.md`
for full details.

| Role | Artifact | Handoff to |
|------|----------|------------|
| Product Manager | `docs/specs/<feature>.md` | UI Designer |
| UI Designer | `design/mockups/<feature>.html` | Engineer Auditor |
| Engineer Auditor | Audit report | Engineer |
| Engineer | Working code + tests | Picky User |
| Picky User | Feedback report / sign-off | PM (next cycle) |

## Before acting

1. Read `docs/PRODUCT_VISION.md` — understand the north star.
2. Read `docs/ROADMAP.md` — understand current phase.
3. Read `docs/ARCHITECTURE.md` — understand the stack and file layout.
4. Check `docs/CHANGELOG.md` — know what changed recently.
5. Run `npm run dev` to verify the app starts.
6. Run `npx playwright test` to verify all tests pass.

## How to propose changes

1. **Audit first** — read the relevant code, run the app, identify issues.
2. **Present options** — structure proposals as options the user can
   accept/decline. Use numbered lists.
3. **Implement after approval** — once the user picks, implement with
   tests and documentation.
4. **Verify** — `npm run typecheck`, `npx playwright test`, `npm run build`
   must all pass before considering done.

## Code conventions

- **Components** — one component per file in `components/<feature>/index.tsx`.
  No barrel exports. Use `"use client"` only when needed.
- **CSS** — all styles in `app/globals.css`. Use design tokens from
  `design/tokens.json` as CSS variables (`--bg`, `--panel`, `--accent`,
  `--fs-sm`, `--s-*`, `--r-*`, `--fw-*`, `--dur`, `--ease`, `--shadow-*`, `--ring`).
  Never hardcode colors, font sizes, or spacing.
- **API routes** — one file per route in `app/api/<feature>/route.ts`.
  Use `proxyToBackend` for backend calls, return JSON.
- **Backend** — FastAPI in `backend/`. One file per domain. No dead imports.
- **Tests** — E2E in `tests/e2e/`, visual in `tests/visual/`. Mock external
  APIs. Keep tests deterministic — no network calls to real backends.
- **No comments in code** — self-documenting code. Use docs/ for explanations.

## Testing before committing

Always run (in order):
```
npm run typecheck
npx playwright test --reporter=line
npm run build
```

If build fails, fix the issue before committing.

## What to do when stuck

- Read the docs/ directory for context
- Search the codebase with grep for similar patterns
- Ask the user for clarification with specific options

## Delegation patterns

- **Code exploration** — use `explore` agent with thoroughness "medium"
- **Implementation** — use `general` agent with clear task description
- **Testing** — write the test first, then ask `general` to run it
- **Documentation** — read existing docs, then write/update
