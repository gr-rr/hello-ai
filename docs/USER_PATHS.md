# Supported End-to-End User Paths

This is the source of truth for the **supported user journeys** through Music AI
Studio. Every path listed here has a Playwright test in `tests/e2e/user-paths.spec.ts`
that runs in CI, so the build fails if a path breaks. This exists because the auth
flow regressed once with no test to catch it.

CI runs E2E with `NEXT_PUBLIC_MOCK_ENABLED=true`. In that mode the frontend proxy
backend is mocked (`mocks/handlers.ts`, `lib/backend.ts`) and **auth is bypassed**
(`BYPASS_AUTH` in `app/HomeClient.tsx` is true for `NODE_ENV=development` OR
`NEXT_PUBLIC_MOCK_ENABLED=true`), so a signed-out user is shown the full Studio.

## Auth mode matters

| Mode | `BYPASS_AUTH` | `/` renders |
|------|---------------|-------------|
| `next dev` (dev) | true | Studio (stepper) |
| mock build / CI E2E (`NEXT_PUBLIC_MOCK_ENABLED=true`) | true | Studio (stepper) |
| production build, no session | false | Non-blocking landing: **Sign In** button + compact Transcribe |
| production build, valid session | false | Studio (stepper) |

The gated landing + Google CTA (P1) and the "session → Studio" transition (P2) are
**only observable in a non-bypass production build**. The mocked CI server always
bypasses auth, so those assertions self-skip there (documented in each test) while
still verifying the app renders without crashing. When the specs run against a
non-bypass server (`BASE_URL` pointing at `next start`, no mock env) they assert the
full flow.

## Paths

- **P1 — Anonymous landing.** A signed-out visitor lands on `/` and sees the app
  without crashing. In a non-bypass build they see the **Sign In** button; clicking
  it reveals the **"Sign in with Google"** CTA (`components/Auth.tsx`). In mock/bypass
  mode they land directly in Studio (also valid — no crash).

- **P2 — Auth session → Studio.** With a valid Supabase session, `AuthProvider`
  (`components/AuthProvider.tsx`) exposes `user`, and `HomeClient` renders `Studio`
  (the numbered stepper). The test seeds a mock session into Supabase's
  `localStorage` token and asserts the stepper renders — this fails if the
  `AuthProvider` session wiring or `HomeClient` gate breaks. Real Google OAuth is
  never exercised (can't run headless in CI). NOTE: this project uses Supabase
  **implicit flow** (`lib/supabase.ts`, `flowType: "implicit"`), so the session is
  parsed from the URL hash by `detectSessionInUrl`; there is intentionally **no**
  `/auth/callback` route. If a future PR switches to PKCE/code exchange it must add
  `app/auth/callback/route.ts` and this test's guard will need updating.

- **P3 — Transcribe (mocked backend).** An authenticated user picks a library file
   (or "Upload new…") → the mocked `/api/music/enhance` + `/api/music/transcribe`
   respond → the **Piano Roll** (`.piano-roll-container`) appears, plus an audio
   player and a MIDI download link. Runs fully offline against the mock backend —
   no ffmpeg / real backend. (Sheet music is not currently rendered.)

- **P4 — Library browse / upload.** A user opens the Library tab, sees the empty
  state, uploads audio (hidden file input), and the file appears with metadata; it
  can be played and deleted. Covered by `tests/e2e/journey.spec.ts` against mocked
  Supabase Storage routes.

## Running

```bash
NEXT_PUBLIC_MOCK_ENABLED=true npx playwright test tests/e2e
```

Start a server first (`NEXT_PUBLIC_MOCK_ENABLED=true npm run dev`) or point
`BASE_URL` at a running instance. To exercise the full P1/P2 auth flow, run against a
non-bypass production build (`npm run build && npx next start`) with `BASE_URL` set
and `NEXT_PUBLIC_MOCK_ENABLED` unset.
