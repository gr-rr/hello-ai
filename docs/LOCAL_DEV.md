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

## Project structure

```
app/
  layout.tsx          — root layout (fonts, CSS imports, metadata)
  page.tsx            — entry point → <Studio>
  globals.css         — all styles (design tokens + components)
  api/                — Next.js route handlers (proxy to backend)
components/
  Studio.tsx          — page shell (topbar + hero + grid)
  transcribe/         — audio → MIDI → piano roll
  library/            — file upload / manage / play
  Spectrogram.tsx     — WaveSurfer spectrogram widget
lib/
  music.ts            — core API: transcribe, enhance, upload, list, delete
  supabase.ts         — Supabase client (graceful fallback)
  storage.ts          — generic storage helpers
  backend.ts          — reverse proxy to Oracle VM
  notes.ts            — pitch → note-name helpers
  analyze.ts          — note-statistics computation
  canvas.ts           — canvas color / CSS-var helpers
design/
  tokens.json         — design tokens (colors, spacing, typography)
  mockups/            — HTML mockups (design SOT)
backend/              — FastAPI (Oracle VM, separate deploy)
tests/
  e2e/                — Playwright user journeys
  visual/             — Playwright visual regression
```
