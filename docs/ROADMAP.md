# Product Roadmap

North star: A music analysis and composition platform that helps users
understand, analyze, and create music — regardless of their existing knowledge.

## Phase 1: Foundation ✅ (Current)

**Core transcription + library management.**
- Audio upload (drag-drop or click) + recording
- WAV → MIDI via basic-pitch (backend)
- MIDI → piano-roll visualization (browser); sheet-music rendering (abcjs) is a planned representation
- Library: upload, list, delete, play (Supabase Storage)
- MIDI download

**Status:** DELIVERED. Tests pass, CI green, docs written.

## Phase 2: Music Analysis ✅ (Delivered)

**Understand what's in the music.**
- Key / tempo / time signature detection
- Chord recognition (audio → chord progression)
- Structural breakdown (verse / chorus / bridge)
- Music theory explainer: "This song is in C major, using I-IV-V-vi chords"
- Similarity search: "Find other songs in my library with similar harmony"
- Note-level analysis: velocity distribution, pitch range, note density

**Why this order:** Analysis unlocks the most value for the broadest audience
(beginners who want to learn, musicians who want to understand songs, producers
who want to analyze references). It feeds directly into Phase 3 (composition
playground needs chord suggestions).

**Status:** Key / tempo / time-signature / chord progression / note-level
statistics are delivered (frontend `components/analyze` + backend `analyze.py`).
Structural breakdown (verse/chorus/bridge) and similarity search remain future work.

**Effort estimate:** Medium. Most analysis can run client-side (abcjs has
some built-in). Chord recognition needs a model on the backend.

## Phase 3: Interactive Composition 🎹

**Create new music with intelligent assistance.**
- Chord progression suggestions (based on key, style)
- Voice-leading checker
- Melody generation conditioned on chords
- Interactive piano roll / score editor
- Template library (blues, pop, jazz progressions)

**Why this order:** Builds on Phase 2 (analysis tells you what works) and
Phase 1 (you can export/import your compositions).

## Phase 4: Autonomous Generation 🤖

**Generate complete pieces from scratch or from a seed.**
- Style-conditioned generation (e.g., "make a lo-fi beat in A minor")
- Variation generation ("give me 5 variations of this chorus")
- Continuation ("extend this melody for 8 more bars")
- Prompt-to-music (text → audio)

**Why this order:** Requires the analysis + composition infrastructure from
Phases 2-3 to be useful (generation without analysis is a black box).

## Phase 5: Fine-tuning & Personalization 🧬

**Adapt models to the user's taste.**
- LoRA fine-tuning on user's library
- Style embedding extraction
- Personalized chord suggestions
- Custom soundfont loading

**Why this order:** Most complex, requires all previous infrastructure.

---

## How phases are sequenced

```
Phase 1 ─► Phase 2 ─► Phase 3 ─► Phase 4 ─► Phase 5
   │           │           │           │           │
   ▼           ▼           ▼           ▼           ▼
 Library   Analysis    Compose     Generate    Personalize
 Upload    Key/tempo   Chord sugg  Style gen   Fine-tune
 Record    Chords      Melody      Variation   Embeddings
 MIDI      Structure   Editor      Continuation Custom sfont
 Score     Explainer   Templates   Prompt
```

Each phase builds on the previous one. Within each phase, features are
ordered by user impact / implementation difficulty.

## Current focus

**Phase 3: Interactive Composition** — chord progression suggestions and an
interactive piano-roll / score editor built on the delivered analysis.

> Note: the Generation (`/generate`, `/compare`) and Fine-tuning (`/train`,
> `/models`, `/models/base`) backend endpoints are already implemented in
> `backend/`; surfacing them in the Studio UI is tracked under Phases 4–5.
