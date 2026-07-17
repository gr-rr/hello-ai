# E2E User Journeys — Blocking PR Checks

Two Playwright tests in `tests/e2e/journey.spec.ts` exercise the **core user flows**
and run as part of the required `build` CI job. A PR cannot merge to `main` if
either test fails.

## Why they're blocking

Before these tests, two bugs reached production:

1. **abcjs audio CSS was missing** → the synth transport showed `0:00` and playback
   was silent. The only fix was the CSS import in `layout.tsx`.
2. **Supabase RLS blocked anon uploads** → Library uploads returned a 403 and the
   user saw a scary "row-level security" error instead of "Saved ✓".

Both were caught manually after deploy. The blocking check prevents that.

## Tests

### 1. Transcribe: upload → sheet music → MIDI download

`tests/e2e/journey.spec.ts:34`

```
Upload a .wav file → backend mocked → ABC notation renders as SVG
                  → "▶ Play" button becomes enabled (synth initialized)
                  → clicking play doesn't break
                  → MIDI download link appears (midi_base64)
```

The backend (`/api/music/enhance` + `/api/music/transcribe`) is **mocked** at
the Playwright route level, so the test runs offline, fast, and deterministically.
The mock returns 5 MIDI notes plus a `midi_base64` string.

What it guards:
- `renderAbc` produces a score SVG
- `setTune` succeeds with a valid soundfont URL
- The abcjs audio CSS is bundled (imported in `app/layout.tsx`)
- MIDI download button renders when `midi_base64` is present (new feature)

### 2. Library: upload via drop zone

`tests/e2e/journey.spec.ts:66`

```
Upload a .m4a file → hits real Supabase Storage → status shows "Saved ✓"
```

This test uses the **real Supabase** project (public anon key from env vars).
It exercises the RLS policies that allow anonymous inserts.

What it guards:
- `anon insert library` policy exists on `storage.objects` (RLS regression)
- The Supabase bucket `library` is accessible
- The drop zone + hidden file input work together (new UI)

The test is skipped gracefully if `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are not set (the CI workflow sets them from repo secrets).

## How they run in CI

`.github/workflows/build.yml`:

```yaml
- run: npm run build
- run: npx playwright install --with-deps chromium
- name: user journeys (server + blocking tests)
  run: |
    npm run start & SERVER_PID=$!
    wait for server
    npx playwright test tests/e2e/journey.spec.ts
    exit $TEST_STATUS
```

The `build` status check is required by branch protection on `main`. If the
journeys fail, the check is red and the PR cannot be merged.

## Running locally

```bash
npm run dev &
npx playwright test tests/e2e/journey.spec.ts
```

The Transcribe test uses mocked backend routes, so it runs offline. The Library
test needs Supabase env vars to hit real storage.

## Adding a new journey

1. Add a test to `tests/e2e/journey.spec.ts` that exercises the core user flow.
2. Mock any external backends with `page.route(…)` to keep it deterministic.
3. The journey runs automatically in CI — no workflow changes needed.
