# E2E User Journeys — Blocking PR Checks

Four Playwright tests in `tests/e2e/journey.spec.ts` exercise the **core user flows**
and run as part of the required `e2e` CI job (`.github/workflows/e2e.yml`). A PR cannot
merge to `main` if any journey fails.

## Why they're blocking

Before these tests, two bugs reached production:

1. **abcjs audio CSS was missing** → the synth transport showed `0:00` and playback
   was silent. The only fix was the CSS import in `layout.tsx`.
2. **Supabase RLS blocked anon uploads** → Library uploads returned a 403 and the
   user saw a scary "row-level security" error instead of "Saved ✓".

Both were caught manually after deploy. The blocking check prevents that.

## Tests

`tests/e2e/journey.spec.ts`:

1. **Library: upload, play, and delete** (`:74`)
   ```
   Upload a .m4a file → hits real Supabase Storage → status shows "Saved ✓"
   → play → delete → list empties
   ```
2. **Library: record button shows recording state** (`:149`)
   ```
   Click Record → recording UI appears (timer + Stop) → Stop returns to idle
   ```
 3. **Transcribe: select library file → piano roll** (`:215`)
    ```
    Pick a library file → backend mocked → piano roll renders
    → audio player appears → MIDI download link appears (midi_base64)
    ```
 4. **Transcribe: Upload new option works** (`:264`)
    ```
    Upload a .wav file → backend mocked → piano roll renders
    → audio name shows in the heading
    → MIDI download link appears (midi_base64)
    ```

The Transcribe journeys mock the backend (`/api/music/enhance` +
`/api/music/transcribe`) at the MSW/route level, so they run offline, fast, and
deterministically. The Library journeys use the **real Supabase** project (public
anon key from env vars) and exercise the RLS policies that allow anonymous inserts.

What they guard:
- Piano-roll container renders from transcribed notes
- Audio player (`audio[controls]`) appears
- MIDI download button renders when `midi_base64` is present
- `anon insert library` policy exists on `storage.objects` (RLS regression)
- The Supabase bucket `library` is accessible
- The drop zone + hidden file input work together

The Library journeys are skipped gracefully if `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set (the CI workflow sets them from repo secrets).

## How they run in CI

`.github/workflows/e2e.yml` starts the built app, waits for `localhost:3000`, then runs
`npx playwright test tests/e2e`. The job is required by branch protection on `main`, so
a failing journey blocks the merge.

## Running locally

```bash
npm run dev &
npx playwright test tests/e2e
```

The Transcribe journeys use mocked backend routes, so they run offline. The Library
journeys need Supabase env vars to hit real storage.

## Adding a new journey

1. Add a test to `tests/e2e/journey.spec.ts` that exercises the core user flow.
2. Mock any external backends with `page.route(…)` to keep it deterministic.
3. The journey runs automatically in CI — no workflow changes needed.
