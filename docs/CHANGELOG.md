# Changelog

> ⚠️ **Accuracy note.** Entries below are historical. Some early claims are
> stale and contradict the current code — notably the 2026-07-17 entry states
> that `app/api/music/library/route.ts` was removed (it still exists) and that
> MusicGen / TrainStudio / CompareStudio were removed (the Generation and
> Fine-tuning backend endpoints — `/generate`, `/compare`, `/train`, `/models`
> — remain implemented in `backend/`). Treat `git log` and the live code as the
> source of truth; see `docs/audits/` for the full findings register.

## 2026-07-17 — Comprehensive codebase cleanup + UX overhaul

### Layout redesign
- Replaced tab-based navigation with single-page 2-column grid layout
  matching the design mockup (`design/mockups/audio-to-sheet-music.html`)
- Added persistent topbar with brand + tabs (Transcribe / Library)
- Added hero section with tagline
- Transcribe and Library now render side by side in a responsive grid
- Removed disabled features (MusicGen, Chat, Piano, DataStudio,
  TrainStudio, CompareStudio) and their dead imports
- Removed `lib/audio.ts` (only used by disabled MusicGen)

### Library overhaul
- Added drag-and-drop zone for file upload (click or drop)
- Added delete button for each file
- Added play/pause button for in-browser audio preview
- Preserved original filenames (stripped timestamp prefix in display)
- Changed badge from "Finetune Studio · Library" → "Audio Library"
- File input is now hidden (triggered by clicking the drop zone)

### Transcribe improvements
- Added MIDI download button when `midi_base64` is returned (not just `midi_url`)
- Added `download="transcription.mid"` attribute for proper file naming

### Dead code removal
- Removed `@huggingface/transformers` dependency (46 packages, unused)
- Removed dead API route `app/api/music/library/route.ts`
- Removed redirect pages for `chat`, `data`, `train`, `compare`
- Removed dead `.nav` CSS class
- Removed dead `.btn-primary` CSS class
- Consolidated duplicate CSS classes (`.badge`, `.muted`, `.status`)
- Fixed `as any` cast in `app/page.tsx`
- Removed unused `json` import in `backend/music_features.py`
- Removed unused `midi_to_wav` import in `backend/main.py`

### CSS improvements
- Added drop-zone, file-list, chip.danger, stage-title, topbar, hero,
  app-grid, brand, footer styles to `globals.css`
- All new styles use design tokens (`--s-*`, `--r-*`, `--fs-*`, etc.)

### Documentation
- Created `docs/PRODUCT_VISION.md` — north star + architecture + principles
- Created `docs/AGENTS.md` — engineering SOT for AI coding agents
- Extended E2E tests to cover MIDI download and new library UI
- All 5 tests pass (2 E2E + 3 visual comparison)
- Build compiles cleanly

### Remaining
- Token consistency audit (hardcoded values → CSS variables)
- Score visual improvements (styling the abcjs player)
- Waveform visualization for audio playback

## 2026-07-20 — Architecture review cleanup

- **Docs reconciliation** against the live code:
  - `docs/COMPONENTS.md`, `README.md`, `LOCAL_DEV.md`, `TOOLING.md` no longer
    reference the deleted `components/Score.tsx` / `lib/abc.ts` /
    `lib/features.ts` / `lib/utils.ts`.
  - Auth flow documented as **PKCE** with `app/auth/callback/route.ts` +
    `app/auth/confirm/page.tsx` (was incorrectly described as implicit flow).
  - `docs/API.md` corrected: `/music/transcribe`, `/music/enhance`,
    `/music/analyze` use `verify_token_optional` (anonymous allowed) and the
    real rate limits; `/models` is not admin-only; generation upload bucket is
    `audio`.
  - Storage bucket list corrected to `library, midi, audio, transcriptions,
    enhanced, analysis, datasets, adapters` (`tracks` is a DB table, not a bucket).
- **Frontend dead code removed**: unused `Transcription` type, `MIDI_BUCKET`,
  `listTranscriptions`, `midiToDataUrl`, `wavToDataUrl` in `lib/music.ts`;
  unused `numNotes`/`onSignIn` props; inlined `withAlpha` duplicated in
  `Visualizer`/`Spectrogram` extracted to `lib/canvas.ts`; hardcoded error
  color replaced with the `--danger-border` token; orphaned `GET /api/music/library`
  proxy (targeted a non-existent backend route) dropped.
- **Backend hardening**: `/music/analyze` now enforces the `MAX_UPLOAD_BYTES`
  (413) guard and sanitizes `fmt` via `_sanitize_fmt()` (closes a local
  write-traversal hole); regression tests added.
- **E2E alignment**: journeys no longer assert the removed `.score-abc`
  renderer; they exercise the shipped piano-roll + audio + MIDI-download flow.
