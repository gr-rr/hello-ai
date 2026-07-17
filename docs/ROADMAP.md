# Product Roadmap

North star: A music analysis and composition platform that helps users
understand, analyze, and create music — regardless of their existing knowledge.

## Phase 1: Foundation ✅ (Current)

**Core transcription + library management.**
- Audio upload (drag-drop or click) + recording
- WAV → MIDI via basic-pitch (backend)
- MIDI → sheet music via abcjs (browser)
- Library: upload, list, delete, play (Supabase Storage)
- MIDI download

**Status:** DELIVERED. Tests pass, CI green, docs written.

## Phase 2: Music Analysis 🔜 (Next)

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

**Phase 2: Music Analysis** — start with key/tempo detection + chord
recognition as the first analysis features. These give the most immediate
value and are the most requested by users.
