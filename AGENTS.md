# Product

Music AI Studio — transcribe audio, analyze, and fine-tune models.

# Key files

- `docs/AGENTS.md` — canonical agent SOT (roles, conventions, testing)
- `docs/ARCHITECTURE.md` — stack, layout, autonomous loop
- `docs/ROADMAP.md` — current phase and milestones

# Stack

Frontend: Next.js 15, React 19, Tailwind v4, abcjs, MSW (dev mocks), Playwright, Argos
Backend: FastAPI, Python, basic-pitch, FluidSynth, ffmpeg
Infra: Supabase (storage + DB), Vercel (frontend), Oracle VM (backend)
Tooling: OpenCode, Playwright MCP, CodeRabbit, Semgrep, aicommits, Sentry (error tracking)

# Tooling — integration & dev-cycle role

## In-agent (OpenCode MCP servers in `opencode.json`)

| Tool | Connection | What the agent can do | When used |
|---|---|---|---|
| **Playwright MCP** (`@playwright/mcp`) | Remote stdio via npx | Browse localhost, click forms, check UI state in real time | E2E debugging, snapshot verification during development |
| **Sentry MCP** (`mcp.sentry.dev`) | Remote streamable HTTP + token auth | Query recent errors, read stacktraces, get issue counts | When CI/tests fail or user reports a bug — agent self-diagnoses |
| **Supabase MCP** (Supabase CLI) | MCP tools in session | Run SQL, list tables, generate types, manage DB | Schema changes, type generation, auth/storage config |

## CI/CD (`.github/workflows/`)

| Pipeline | Trigger | Steps | Enforces |
|---|---|---|---|
| **Build** | `push` + `pull_request` | `npm ci`, `npm run build` | TypeScript compiles cleanly |
| **CI** | `pull_request` | Lint, typecheck, Playwright E2E tests (blocking) + Argos visual diff | No regressions in logic or UI |
| **Argos** | Within CI | Screenshot comparison via Playwright + argos-ci | Visual consistency across PRs |

## PR review automation

| Tool | Integration | What it does | Config |
|---|---|---|---|
| **CodeRabbit** | GitHub App (`coderabbitai[bot]`) | Reviews every PR — flags bugs, naming, missing tests, security | `.github/coderabbit.yaml` (path-specific rules) |
| **Semgrep** | GitHub App (not action) | SAST scanning — catches insecure patterns, bad imports | Installed at org level; no workflow file needed |

## Error tracking

| Tool | Entry point | What it captures | Setup required |
|---|---|---|---|
| **Sentry SDK** (`@sentry/nextjs`) | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `app/global-error.tsx` | Unhandled exceptions, API errors, client-side crashes | `SENTRY_DSN` in `.env.local` from Sentry project → Client Keys |
| **Sentry MCP** (agent) | `opencode.json` | Agent queries Sentry for issue details | `SENTRY_ACCESS_TOKEN` env var + restart OpenCode |

## Local dev helpers

| Tool | What it does | How to run |
|---|---|---|
| **MSW** | Mocks API routes (`/api/*`) in dev to decouple frontend from backend | Auto-starts when `NEXT_PUBLIC_MOCK_ENABLED=true` in `.env.local` or CI |
| **Playwright** | E2E + visual tests | `npx playwright test` |
| **aicommits** | AI-generated commit messages | `aicommits` (uses OpenAI) |
| **Supabase CLI** | Local DB, migrations, type gen | `supabase start`, `supabase db diff`, `supabase gen types` |

# Rules

- Read `docs/AGENTS.md` before making changes
- No hardcoded colors — use CSS variables from globals.css
- No comments in code — self-document via naming and docs/
- E2E tests in `tests/e2e/`, visual in `tests/visual/`
- Build + lint + typecheck must pass before committing
