# Product Spec: Key & Tempo Detection

**Phase:** 2 — Music Analysis
**Cycle:** 1
**Author:** PM (agent)

## User story

As a user who has transcribed an audio file to MIDI,
I want to see the **estimated key, tempo (BPM), and time signature**
of the transcription,
So that I can understand the musical structure without music theory knowledge.

## Acceptance criteria

1. After transcription completes, the result panel shows a new **"Analysis"** section
   above the Note events section.
2. Analysis section displays:
   - **Key** — e.g., "C major" or "A minor" (with confidence indicator)
   - **Tempo** — e.g., "120 BPM" (computed from note timing)
   - **Time signature** — e.g., "4/4" (estimated from note groupings)
3. Analysis is computed **client-side** from the note data only (no backend call).
4. Analysis appears within 100ms of receiving transcription results.
5. Empty/loading states: analysis shows "—" when not yet computed.
6. All text uses the app's design tokens (no hardcoded colors/sizes).
7. E2E test asserts analysis section appears with expected values.

## Scope boundary

- **IN:** Key/tempo/time-signature from MIDI note data (client-side).
- **IN:** Display in the transcribe results panel.
- **OUT:** Audio-based analysis (no microphone/FFT analysis).
- **OUT:** Chord recognition (separate cycle).
- **OUT:** Backend changes (entirely client-side for this cycle).

## Technical approach

### Key detection (Krumhansl-Schmuckler)
Use the Krumhansl-Kessler key profiles to match the pitch-class histogram
from the transcribed notes against major and minor key templates.

Algorithm:
1. Build a 12-bin pitch-class histogram from the MIDI notes (weighted by velocity × duration).
2. Correlate against the 12 major and 12 minor K-K profiles.
3. The best-matching key wins. Confidence = correlation difference between
   best and second-best.

### Tempo
1. Use the shortest inter-onset interval (IOI) between consecutive note starts
   as the beat duration.
2. Convert to BPM: 60 / beat_duration_in_seconds.
3. Round to nearest integer.

### Time signature
1. Count beats per bar using autocorrelation of onset patterns.
2. Most common grouping → time signature numerator.
3. Default to 4/4 if ambiguous.

### Implementation files
- New: `lib/analysis.ts` — key/tempo/time-signature algorithms
- Modify: `components/transcribe/index.tsx` — display analysis results
- Modify: `tests/e2e/journey.spec.ts` — assert analysis section

## Success metrics

- Key detection is within 1 accidental of ground truth for monophonic/polyphonic
  MIDI from basic-pitch (roughly 70%+ accuracy).
- Tempo is within ±5% for steady-tempo music.
- Time signature is correct for common meters (4/4, 3/4, 6/8).
- Analysis renders in less than a frame (<16ms compute, <100ms total).
