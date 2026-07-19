# Critical Code Review — Music AI Studio

Date: 2026-07-19
Scope: full codebase review of `main` (frontend, backend, infra/CI, repo hygiene).
Goal: a more reliable, clean, principled, minimal codebase.

This document is the findings register. A companion PR addresses the low-risk,
high-value subset (see [What this PR changes](#what-this-pr-changes)); everything
else is tracked here as prioritised follow-ups.

Severity: **P0** critical (security / data loss / correctness) · **P1** important
· **P2** cleanup.

---

## Summary

The codebase is small (~4.6k LOC) and, for the most part, well structured:
module separation in the backend is good, the CSS-variable design system is
consistently applied, auth cleanup is correct, and test coverage of the risky
paths (path traversal, contract drift) is above average.

The main problems are:

1. **Secrets & access control** — a live Supabase URL + anon key are hardcoded as
   fallbacks and committed to `.env.example`; RLS policies are effectively
   disabled (`using (true)` everywhere, public buckets), so anyone can read,
   write, and delete all data.
2. **CI that lies** — the E2E build step omits `NEXT_PUBLIC_MOCK_ENABLED`, so the
   compiled bundle ships with mocks off; tests exercise the wrong build.
3. **Reliability hotspots** — an ineffective training lock (race), blocking torch
   inference on the request path, no adapter-cache eviction, and a couple of
   Web-Audio / effect-cleanup leaks on the frontend.
4. **Cruft** — dead code (`Score.tsx`, `lib/features.ts`, `lib/abc.ts`,
   `deleteTranscription`, no-op filters), duplicated helpers, redundant workflows
   and docs, overlapping git-hook mechanisms.

---

## P0 — Critical

### P0-1 · Hardcoded live Supabase credentials — `lib/supabase.ts:4-5`, `.env.example:10,13`
A real project URL and anon key are baked into the client bundle as fallbacks,
and the same live project ref sits in `.env.example`. If env vars are missing,
prod silently talks to this project. Combined with P0-2 this is a full data-exposure
path.
**Fix (this PR):** drop the fallback constants; `supabase` is `null` when env is
absent (the code already guards on `isSupabaseConfigured`). Replace `.env.example`
values with placeholders.

### P0-2 · RLS effectively disabled — `supabase/migrations/*.sql`
Every table policy is `using (true)` / `with check (true)`; `jobs` allows public
`update`, `library` allows public `delete`; all buckets are `public: true`. Anyone
can wipe the library or inject training jobs.
**Follow-up (needs DB deploy):** scope policies to `auth.uid()` via an
`owner`/`user_id` column; remove public `update`/`delete`; make buckets private +
signed URLs.

### P0-3 · Training slot lock is a no-op race — `backend/main.py` (`_run_training` guard)
The handler acquires `_training_slot` then immediately `release()`s before the
background task re-acquires it, so two concurrent `/train` calls both pass.
**Follow-up:** remove the handler pre-check; acquire once inside `_run_training`,
mark the job errored if the slot is taken, release in `finally`.

### P0-4 · Blocking model inference on the request path — `backend/main.py` `/generate`, `/compare`
`generate_audio` / `ft_generate` load hundreds of MB of torch weights and run
inference synchronously, blocking the worker. `/compare` reloads the finetune
model twice per call.
**Follow-up:** `await run_in_threadpool(...)` (or a real queue); cache
`(base, adapter) -> pipeline` with an LRU.

---

## P1 — Important

### P1-1 · E2E builds with mocks OFF — `.github/workflows/e2e.yml` (Build step)
`NEXT_PUBLIC_*` is inlined at **build** time. The Build step has no `env:`, so
`NEXT_PUBLIC_MOCK_ENABLED` is `false` in the bundle; setting it on `Start` is too
late. MSW never starts in CI.
**Fix (blocked on token `workflow` scope):** add
`NEXT_PUBLIC_MOCK_ENABLED: "true"` to the Build step's `env:`. Documented here for
a maintainer with workflow scope.

### P1-1b · CI ruff version drift — `ci.yml` `Run: pip install ruff` vs `backend/requirements.txt`
CI runs `pip install ruff` (unpinned → latest, e.g. 0.15.22) while the repo pins
`ruff==0.5.7`. Newer ruff reformats `backend/analyze.py`, so `ruff format --check`
fails the `lint` job on every PR through no fault of the PR.
**Partly resolved:** `analyze.py` reformatted to output both 0.5.7 and 0.15.x
agree on, so the gate is green now. **Still recommended (needs `workflow` scope):**
pin CI to `pip install ruff==0.5.7` to match `requirements.txt`/pre-commit and
prevent future drift.

### P1-2 · `backend/main.py` is a 648-line God file
Auth, Supabase glue, job orchestration, and every route live together. The other
backend modules are cleanly separated — `main.py` should follow.
**Follow-up:** split into `routers/*` + `services/supabase.py`, `services/jobs.py`,
`core/auth.py` via `APIRouter`.

### P1-3 · No adapter-cache eviction — `backend/main.py` `ADAPTER_ROOT`
Adapter dirs are downloaded and cached forever; a small VM volume fills up.
**Follow-up:** LRU/age-based eviction.

### P1-4 · `upload_library` accepts a raw `dict` — `backend/main.py`
Every other route uses a Pydantic model; this one bypasses validation and OpenAPI.
**Follow-up:** add `class UploadLibraryRequest(BaseModel)`.

### P1-5 · IDOR on transcription delete — `backend/main.py` `delete_transcription`
`record_id` is never checked against the caller; any authed user can delete any
transcription.
**Follow-up:** verify row ownership before delete.

### P1-6 · O(n²) base64 + hardcoded mime/bpm — `components/transcribe/index.tsx`
`new Uint8Array(buf).reduce((s,b)=>s+String.fromCharCode(b),"")` is quadratic and
can freeze the UI / blow the stack on large audio. The recorder blob is hardcoded
`audio/webm` (ignores `rec.mimeType`) and `PianoRoll bpm={120}` ignores the
analysed tempo.
**Fix (this PR):** chunked base64 encode; use `rec.mimeType`; pass
`result.analysis?.tempo.bpm ?? 120`.

### P1-7 · Silent library-load failure — `components/transcribe/index.tsx`
`listLibrary().then(setLibFiles).catch(() => {})` swallows errors; empty UI with no
explanation.
**Fix (this PR):** surface a non-blocking error state.

### P1-8 · Duplicated helpers — `pitchToName`, note-name arrays
Reimplemented in `PianoRoll.tsx`, `mocks/handlers.ts`, `analyze/index.tsx`,
`lib/abc.ts`.
**Fix (this PR):** single `lib/notes.ts`.

### P1-9 · Redundant CI build work — `build.yml` / `e2e.yml` / `argos.yml`
Three jobs each run `npm ci` + `npm run build`; pip/Playwright browsers uncached.
**Follow-up:** build once, share `.next` artifact; add `cache: pip` and cache
`~/.cache/ms-playwright`.

---

## P2 — Cleanup

### P2-1 · Dead code (removed in this PR)
- `components/Score.tsx` — unreferenced (only consumer of `lib/abc.ts`).
- `lib/features.ts` — imported nowhere.
- `lib/abc.ts` — only imported by the dead `Score.tsx`.
- `lib/music.ts` `deleteTranscription` — never called, and points at a
  nonexistent route (`/api/music/transcriptions/*` vs the real
  `/api/music/library/transcription/*`).
- `components/transcribe/index.tsx` `.filter((f) => true)` no-op.
- `components/analyze/index.tsx` `const NOTE_NAMES = SHARP;` pointless alias
  (folded into `lib/notes.ts`).

`abcjs` dep + its CSS import in `app/layout.tsx` are now orphaned but **kept** —
the sheet-music feature is clearly planned; flagged for a maintainer decision.

### P2-2 · Hardcoded colors — `components/PianoRoll.tsx`, `components/Spectrogram.tsx`
`NOTE_COLORS` literal hex map violates the "no hardcoded colors" rule.
**Fix (#51):** PianoRoll note fills driven from `var(--accent)`.
**Follow-up (DONE):** `Spectrogram.tsx` shipped with `rgba(192,132,252,…)` literals
(= `--accent`) for canvas colors; now resolved from the `--accent`/`--accent-strong`
CSS variables at runtime. (`Visualizer.tsx` canvas still uses literal hex/hsl for
its scope — larger canvas-theming change, tracked separately.)

### P2-3 · Dependency nits — `package.json` — DONE
- standalone `playwright` is redundant with `@playwright/test`.
- `eslint-config-next@^16` on a Next 15 app (major skew).
- `lint --max-warnings 200` makes the gate almost meaningless.
**Resolved:** dropped standalone `playwright`; aligned `eslint-config-next@^15`;
ratcheted `--max-warnings` to `0` (repo currently has zero warnings).

### P2-4 · Repo hygiene
- Two agent SOTs: root `AGENTS.md` vs `docs/AGENTS.md` (docs is canonical).
- `docs/LOCAL_DEV.md` vs `docs/DEVELOPMENT.md` overlap; `docs/TOOLING.md`
  duplicates the AGENTS tooling table and references `next.config.ts` (file is
  `.mjs`).
- Three commit-hook mechanisms (`.githooks/`, `.pre-commit-config.yaml`,
  `commitlint.config.js`) + two installers.
- Unreferenced `scripts/ux-audit.mjs`, `scripts/check-warning.mjs`.
- `scripts/auto_merge.sh` tears down branch protection to merge — use
  `gh pr merge --admin` instead.
**Partly resolved:** deleted unused `ux-audit.mjs`, `check-warning.mjs`,
`install-hooks.sh`, `auto_merge.sh`; `docs/PARALLEL_WORKFLOW.md` now points to
`gh pr merge`; fixed `docs/TOOLING.md` stale `next.config.ts` → `.mjs`. Root
`AGENTS.md` (OpenCode project instructions) intentionally kept — it points to the
canonical `docs/AGENTS.md`, not a duplicate. `LOCAL_DEV.md` (npm) and
`DEVELOPMENT.md` (Docker) kept — different audiences.

### P2-5 · Gitleaks gaps — `.gitleaks.toml`
Allowlisting test files + `package-lock.json` and narrowing `generic-api-key` to
`sk-*` disables default detection for AWS/GCP/Slack keys.
**Follow-up:** rely on `useDefault = true`; drop the broad allowlist.

### P2-6 · Web-Audio / effect leaks (frontend) — DONE (Visualizer)
- `components/Score.tsx` (deleted in #51) rebuilt the synth on every change with no
  cleanup.
- `components/Visualizer.tsx` — `createMediaElementSource` can only run once per
  element; the source binding is fragile if the element is replaced.
**Resolved:** `Visualizer` now caches the `AudioContext` + source node per element
(`WeakMap`) so re-runs reuse the routed graph instead of throwing; cleanup no
longer closes the shared context.

---

## What this PR changes

Low-risk, high-value only (no DB, no backend inference, no workflow-scope files):

- **P0-1** remove hardcoded Supabase creds (`lib/supabase.ts`, `.env.example`).
- **P1-6** chunked base64 + `rec.mimeType` + analysed bpm in transcribe.
- **P1-7** surface library-load errors.
- **P1-8 / P2-1** new `lib/notes.ts`; delete dead code
  (`Score.tsx`, `lib/features.ts`, `lib/abc.ts`, `deleteTranscription`, no-ops).
- **P2-2** PianoRoll note colors via CSS variable.

Everything under "Follow-up" is intentionally out of scope for a safe,
reviewable PR and should be split into dedicated changes (RLS migration, backend
refactor, CI env fix with `workflow` scope, doc consolidation).
