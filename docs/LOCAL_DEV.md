# Local Development

## Prerequisites

- Node.js 22+
- pnpm (or npm)
- A Supabase project (optional, for Library storage)

## Quick start

```bash
git clone <repo>
cd hello-ai
npm install
npm run dev
```

Open http://localhost:3000. The Transcribe tab works offline (backend mocked
in E2E tests) but needs the Oracle backend for real transcription.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/publishable key
- `MUSIC_BACKEND_URL` — Oracle backend URL (default: `https://gricci-testing.duckdns.org`)
- `ARGOS_TOKEN` — Argos CI token (only needed for visual diff uploads)

## Testing

```bash
# Start the app
npm run dev

# Run E2E + visual tests (in another terminal)
npx playwright test

# Run only E2E journeys
npx playwright test tests/e2e/journey.spec.ts

# Run only visual comparison
npx playwright test tests/visual/preview.spec.ts
```

The Transcribe E2E test mocks the backend, so it runs without the Oracle VM.
The Library test needs real Supabase credentials.

For the canonical project structure, see `docs/ARCHITECTURE.md` §9.
