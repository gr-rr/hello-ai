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

# Rules

- Read `docs/AGENTS.md` before making changes
- No hardcoded colors — use CSS variables from globals.css
- No comments in code — self-document via naming and docs/
- E2E tests in `tests/e2e/`, visual in `tests/visual/`
- Build + lint + typecheck must pass before committing
