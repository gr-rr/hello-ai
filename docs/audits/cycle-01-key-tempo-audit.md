# Audit Report — Cycle 01: Key/Tempo Analysis

**Auditor:** Engineer Auditor (agent)
**Date:** 2026-07-17
**Feature spec:** `docs/specs/key-tempo-analysis.md`

## Files audited

### components/transcribe/index.tsx

- No dead imports or unused variables — all imports and handlers are used.
- `TranscribeResult` consumed at lines 137, 139–141, 144–153, 156.
- **Analysis section slot:** between MIDI download block end and `<h4>Note events</h4>`.
- Analysis should be a local computation after `setResult` using `result.notes`.

### lib/music.ts

- `TranscribeResult` (lines 4–11) — adding an optional `analysis?: Analysis` is the cleanest integration path.
- `Score.tsx` (line 8) uses `TranscribeResult["notes"]` — backward-compatible.
- **Dead code:** `MIDI_BUCKET` constant at line 14, never referenced.

### app/globals.css

- `.notes-grid` (line 600): `gap: 6px` (not a token), `margin-top: 8px` (should be `var(--s-2)`)
- `.note-chip` (line 607): `padding: 3px 8px` (not token), `font-size: 12px` (should be `var(--fs-xs)`)
- Reusable patterns for analysis display: `.chip`, `.muted`, `.panel`

### tests/e2e/journey.spec.ts

- Mock fixture (5 notes, C major scale, 0.5s intervals)
- Expected analysis: **C major**, **120 BPM**, **4/4**
- Assertion should go after MIDI download link assertion
- Recommend extending fixture with ~3 more notes for better time-signature detection

## Summary

| Type | Count |
|------|-------|
| Blocker issues | 0 |
| Minor issues | 2 |
| Recommendations | 4 |

**Minor issues:** dead `MIDI_BUCKET` constant, hardcoded CSS values in `.notes-grid`/`.note-chip`.
**Recommendations:** Add `analysis?` to `TranscribeResult`, create `lib/analysis.ts`, compute client-side, extend test fixture to 8+ notes.
