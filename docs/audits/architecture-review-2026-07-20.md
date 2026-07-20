# Architecture Review — 2026-07-20

Scope: full codebase audit for better system-design hygiene — dead-code
cleanup, documentation accuracy, and an updated architecture diagram. This
is a follow-up to `docs/audits/CODE_REVIEW.md` (2026-07-19); it closes the
doc/code drift that review found and adds a fresh pass over the current tree.

Severity: **P0** critical · **P1** important · **P2** cleanup. Items marked
**Done** in this review were committed to `chore/architecture-review`.

---

## 1. Dead code removed (Done)

| Item | Location | Note |
|------|----------|------|
| `Transcription` type, `MIDI_BUCKET` | `lib/music.ts` | unreferenced exports |
| `listTranscriptions`, `midiToDataUrl`, `wavToDataUrl` | `lib/music.ts` | never called; frontend uses Supabase directly |
| `numNotes` prop | `components/analyze/index.tsx` (+ `Studio.tsx` pass) | declared, never used |
| `onSignIn` prop | `components/library/index.tsx` (+ `Studio.tsx` pass) | declared, never used |
| `GET /api/music/library` handler | `app/api/music/library/route.ts` | proxied to a **non-existent** backend route (only POST exists) — would 500 if hit |
| Dead MSW handlers | `mocks/handlers.ts` | `GET /api/music/library` (no frontend caller) |
| Inline `<style>` in Library | `components/library/index.tsx` | moved to `app/globals.css` |
| Duplicated `withAlpha` | `Visualizer.tsx` / `Spectrogram.tsx` | extracted to `lib/canvas.ts` |
| Inline quadratic `btoa` | `components/Studio.tsx` | replaced with `blobToBase64` from `lib/music.ts` |
| Orphaned `.score-abc` CSS | `app/globals.css` | renderer (`Score.tsx`) was deleted in #51 |

Net: **−48 lines** of dead code; one shared helper added (`lib/canvas.ts`).

## 2. Documentation reconciliation (Done)

The 2026-07-19 cleanup deleted `components/Score.tsx`, `lib/abc.ts`,
`lib/features.ts` but most docs still described them as live. Reconciled
across `ARCHITECTURE.md`, `COMPONENTS.md`, `README.md`, `LOCAL_DEV.md`,
`TOOLING.md`, `E2E.md`, `USER_PATHS.md`, `API.md`, `PRODUCT_VISION.md`,
`ROADMAP.md`, `CHANGELOG.md`:

- Removed all `Score.tsx` / `lib/abc.ts` / `lib/features.ts` / `lib/utils.ts`
  references; pointed at the real modules (`notes.ts`, `analyze.ts`,
  `canvas.ts`, `Spectrogram.tsx`).
- **Auth model corrected**: `/music/transcribe`, `/music/enhance`,
  `/music/analyze` use `verify_token_optional` (anonymous allowed) — not
  "required" as `API.md` claimed. Real rate limits (transcribe 10/min) fixed.
- **Auth flow corrected**: Supabase **PKCE** with `app/auth/callback/route.ts`
  + `app/auth/confirm/page.tsx` — not the "implicit flow, no callback route"
  that `USER_PATHS.md` / `COMPONENTS.md` asserted.
- **Buckets corrected**: `library, midi, audio, transcriptions, enhanced,
  analysis, datasets, adapters`; `tracks` is a DB table, not a bucket.
- **Sheet music** documented as a *planned* representation; piano roll +
  analysis ship today (Phases 1–2 delivered; Gen/Fine-tune backend exists).
- `CHANGELOG.md` given an accuracy caveat (some 2026-07-17 entries are stale)
  and a 2026-07-20 audit entry.

## 3. Architecture diagram (Done)

`docs/ARCHITECTURE.md` now has a renderable **Mermaid** diagram as the
canonical view (browser → Vercel `app/api/*` proxy → Oracle VM Caddy/FastAPI
→ Supabase service-role), replacing the stale ASCII art.

## 4. Tests aligned with reality (Done)

`tests/e2e/journey.spec.ts` and `tests/e2e/user-paths.spec.ts` asserted
`.score-abc` (the deleted abcjs renderer) — those assertions can never pass,
so the "blocking" E2E gate was effectively red. Removed the assertions; the
gate now exercises the real flow (piano roll + audio player + MIDI download).
This makes the documented "green CI blocks bad merges" claim truthful.

## 5. Backend security holes closed (Done)

- **`/music/analyze` missing upload-size guard** — added the `MAX_UPLOAD_BYTES`
  (413) check before decoding audio, matching `upload_library`/`enhance`/
  `transcribe`. (CODE_REVIEW P1-class; was an unauthenticated DoS/oom vector.)
- **`/music/analyze` raw `fmt` traversal** — `ext` was built from `req.fmt`
  directly and joined into a temp-path; a crafted `fmt` like `../../tmp/evil`
  escaped the temp dir. Now routed through `_sanitize_fmt()`.
- Regression tests added in `backend/tests/test_security.py`
  (`test_analyze_rejects_oversized_payload`, `test_analyze_sanitizes_fmt`).

> Note: backend tests could not be executed in this environment (local Python
> is 3.9; `backend/` requires 3.11+ for `datetime.UTC`). The changes mirror
> existing, CI-validated guard patterns in the same file.

## 6. Known issues deferred (tracked, not fixed here)

These were intentionally left for dedicated, reviewable PRs (risky / behavioral
/ need VM or DB deploy). They are carried over from `CODE_REVIEW.md`:

### P1 — backend design & security
- **IDOR on transcription delete** (`backend/main.py` `delete_transcription`)
  — no ownership check; any authed user can delete any transcription.
- **Unreachable transcription-delete route** — the greedy
  `DELETE /music/library/{path:path}` is registered first and returns `400`
  for `/music/library/transcription/*`, so the dedicated route can't be hit.
- **`DELETE /music/library/{path}` uses the forbidden `path.replace(...)`**
  anti-pattern instead of `_valid_library_key()`.
- **Write endpoints use `verify_token_optional`** (`/music/enhance`,
  `/music/transcribe`) — anonymous clients can store files. Product-intended
  (no-login Studio) but contradicts the AGENTS.md "every state-changing route
  requires `verify_token`" rule; needs explicit sign-off.
- **Blocking inference on the request path** (`/generate`, `/compare`,
  `/music/transcribe`, `/music/enhance`) — no `run_in_threadpool`/LRU; the
  single-CPU VM serializes.
- **`main.py` God file** (~675 LOC: auth + supabase glue + job orchestration
  + 15 routes). Split into `routers/` + `services/`.
- **Unbounded caches** — `_job_logs` (memory) and `_resolve_adapter` disk
  (`ADAPTER_ROOT`) grow without eviction.
- **`upload_library` takes a raw `dict`** instead of a Pydantic model.
- **`musicgen_server.generate_audio` ignores the caller's `model` arg**
  (always loads `facebook/musicgen-small`).

### P1 — CI
- **E2E builds with mocks OFF** (`.github/workflows/e2e.yml` `Build` step has
  no `NEXT_PUBLIC_MOCK_ENABLED=true`; it is only set on `Start`). The bundled
  app ships mocks-off, so MSW never starts — the mock-dependent Transcribe
  journeys don't behave as designed in CI. Needs `workflow` scope to fix.
- **Unpinned `ruff` in `ci.yml`** (`pip install ruff` vs `ruff==0.5.7` in
  `requirements.txt`) — format-check drift. Pin to match.

### P2 — hygiene
- **Caddy/TLS not represented in repo** — `ARCHITECTURE.md`/`README.md` describe
  an Oracle Caddy→FastAPI+Let's Encrypt layer, but no `Caddyfile` exists and
  `backend/docker-compose.yml` runs only `uvicorn` (no Caddy/TLS).
- **`gitleaks.toml` allowlist** disables default AWS/GCP/Slack detection.
- **Duplicated helpers in backend** — base64+size-guard ×3, fmt handling
  divergent (`transcribe_audio` ignores its `fmt`), auth dependency duplicated.
- **Over-broad "no comments" drift** — several modules still carry explanatory
  comments; acceptable but inconsistent with the AGENTS.md rule.
- **`abcjs` dependency retained** as an orphan (only `abcjs-audio.css` imported
  in `app/layout.tsx`) for the planned sheet-music feature — maintainer call.

---

## Verification performed
- `npx tsc --noEmit` — passes.
- `npx next lint --max-warnings 0` — passes.
- `npm run build` — see final commit verification.
- Backend unit/security tests — not runnable locally (Python 3.9 vs 3.11+);
  rely on CI (`ci.yml` / `e2e.yml`).
