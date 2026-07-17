# Development Diary

Running log of decisions, challenges, learnings, and context from each
development cycle. Newest first.

---

## Cycle 01 — Key/Tempo Detection (2026-07-17)

**Status:** In progress

### What we set out to do
Add phase-2 music analysis (key, tempo, time signature) to the transcribe
results panel. Entirely client-side — no backend changes.

### Artifacts generated
- `docs/specs/key-tempo-analysis.md` — PM product spec
- `design/mockups/analysis-key-tempo.html` — UI Designer mockup (3 states)
- `docs/audits/cycle-01-key-tempo-audit.md` — Engineer Auditor report

### Decisions
- **All analysis client-side** — key (Krumhansl-Schmuckler), tempo (IOI-based),
  time signature (onset autocorrelation). No backend calls needed.
- **TranscribeResult.analysis** — optional field added to the type, computed
  as a derived step after transcription results arrive.
- **Mockup shows 3 states** — populated, empty (—), and loading (pulse). This
  sets the standard for all future feature mockups.

### Challenges
- Key detection from basic-pitch MIDI is limited: basic-pitch produces
  polyphonic MIDI with many spurious notes, which pollutes the pitch-class
  histogram. The K-S algorithm works well on clean MIDI but may show
  lower confidence on noisy transcriptions.
- Tempo detection from IOI assumes steady tempo throughout. Rubato sections
  will produce inaccurate results. A future improvement could use
  beat-tracking instead of strict IOI.

### Learnings
- Agent loops work well when each role produces a concrete file artifact.
- The mockup-first approach catches UX issues before code is written.
- Need to be explicit about what's IN scope vs OUT in the spec to prevent
  agent scope creep.
- Auditor caught 2 minor CSS issues that should be fixed alongside the feature.

### Open questions
- Should key/tempo be displayed during transcription (estimated from partial
  notes) or only after completion? Spec says after completion.
- What accuracy threshold should trigger "—" instead of a low-confidence result?
  Proposal: <30% confidence → show "—" (too uncertain to display).

---

## How to use this diary

After each cycle, add a new entry with:
1. What was attempted
2. What artifacts were produced (with file paths)
3. Key decisions made and why
4. Challenges encountered
5. Learnings for future cycles
6. Open questions

This is the `docs/` SOT for context — read it before starting a new cycle
to avoid repeating mistakes or overwriting prior decisions.
