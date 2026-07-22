# Testing & E2E tooling — explained for humans

This project has a layered test setup: browser E2E, visual-diff, API mocking,
component/unit tests, and backend pytest. This doc explains what each tool is for,
how the frontend tests are wired, how to run them locally, and — importantly — a
known gap where real-backend regressions slip through.

## Tools at a glance

| Tool | What it is | Where |
|---|---|---|
| **Playwright** | Browser end-to-end tests | `tests/e2e/*.spec.ts` |
| **Argos** | Screenshot/visual diff | `tests/visual/preview.spec.ts` |
| **MSW** | API mocking (fake backend in the browser) | `mocks/handlers.ts` |
| **Vitest** | Component / unit tests | `tests/components/*` |
| **pytest** | Backend unit / security / contract / smoke | `backend/tests/*.py` |

## How frontend tests are wired

The frontend E2E suite does **not** talk to a real backend. Two things combine to
make this true:

1. `playwright.config.ts` auto-starts the Next.js app and forces
   `NEXT_PUBLIC_MOCK_ENABLED=true`, so tests run against **fake** APIs.
2. MSW (Mock Service Worker) is started in the browser by
   `components/MSWInit.tsx` whenever `NODE_ENV === "development"` **OR**
   `NEXT_PUBLIC_MOCK_ENABLED === "true"`. The fake responses live in
   `mocks/handlers.ts` as happy-path canned JSON.

So the test browser renders the real React UI but every `/api/*` call is answered
by MSW with predetermined successful data.

## Run E2E locally

```bash
npm install
npx playwright install chromium --with-deps
npx playwright test                # all E2E
npx playwright test tests/e2e      # just e2e (not visual)
```

The HTML report lands in `playwright-report/`.

> **Gotcha:** `npm run dev` ALWAYS uses mocks (MSW is force-enabled in dev). There
> is no way to point `npm run dev` at a real backend.

## Run against a REAL backend (opt-in)

Because dev mode force-enables MSW, you must use a production build with mocking
turned off to exercise the live backend:

```bash
export NEXT_PUBLIC_MOCK_ENABLED=false
export MUSIC_BACKEND_URL=https://gricci-testing.duckdns.org
npm run build && npm run start &
npx playwright test tests/e2e
```

This is the only way to catch real FastAPI behavior (e.g. upload-size 413,
validation 422, auth 403/401) from the browser side.

## See Argos snapshots

```bash
npx playwright test tests/visual    # local: report in playwright-report/
```

In CI, Argos posts a visual-diff comment on each PR and the full gallery is on
https://app.argos-ci.com (needs the `ARGOS_TOKEN` repo secret). Argos is
**non-blocking** by design.

## Run backend pytest

Backend tests pull in heavy deps (torch, librosa, basic-pitch, ffmpeg):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -q
```

Covered:

- `test_security.py` — upload-size, path-traversal, format-sanitization, error-leak.
- `test_contract.py` — every `app/api/*` proxy has a matching FastAPI route.
- `test_observability.py` — structured logs + `x-request-id`.
- `test_health.py` — `/health/live` and `/health/ready`.
- `test_transcribe_e2e.py` — end-to-end transcription path.

Frontend unit tests: `npm test` (Vitest).

## What E2E covers

- `landing.spec.ts` — anonymous visit to the landing page.
- `auth.spec.ts` — mocked session → Studio, tab navigation.
- `library.spec.ts` — empty-library state.
- `transcribe.spec.ts` / `journey.spec.ts` / `user-paths.spec.ts` — upload → piano
  roll; analyze view.

These run in a real browser against the real React UI — but with MSW fakes, not
the backend.

## ⚠️ KEY GAP — real-backend regressions are NOT caught by E2E

All E2E runs against `mocks/handlers.ts`, which returns **successful canned JSON**.
It does **not** replicate backend behavior such as:

- upload-size → **HTTP 413** (the host proxy ~1MB body limit),
- validation → **HTTP 422**,
- auth → **HTTP 401 / 403**.

So a real FastAPI regression — e.g. the known `/api/music/analyze` 413/422 bugs —
is **not** caught by the E2E suite. `test_contract.py` only checks that a proxy
target **exists**, not that its response shape matches.

**Recommendation:** add at least one E2E journey with `NEXT_PUBLIC_MOCK_ENABLED=false`
against a live or staged backend so the 413/422/401/403 classes are actually
exercised.

## CI integration

| Workflow | What runs | Blocks merge? |
|---|---|---|
| `build.yml` | `npm run build` + Vitest | ✅ |
| `ci.yml` | lint + typecheck + ruff + backend pytest | ✅ |
| `e2e.yml` | Playwright vs MSW mocks | ✅ |
| `argos.yml` | visual diff | ❌ (informational) |

E2E is a required gate; Argos is informational. **Neither tests the real backend
end-to-end** — see the gap above.
