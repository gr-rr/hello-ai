# hello-ai UI Component Library

This document describes all reusable UI components used across the Music AI Studio. All components must consume design tokens from `design/tokens.json` (accessed as CSS variables in `app/globals.css`). No hardcoded values are allowed in components.

## Component Directory Structure

```
components/                    — All React components
  Studio.tsx                  — Main page shell (topbar + stepper)
  Auth.tsx                    — Sign-in button / OAuth handler
  AuthProvider.tsx            — Supabase session management
  Library/                    — Library UI suite
    index.tsx                 — Library control panel (upload, list, playback)
    Visualizer.tsx            — Audio waveform visualizer
  PianoRoll.tsx              — Interactive piano keyboard
  Score.tsx                  — abcjs sheet music renderer + audio player
  Transcribe/                — Transcription UI (drop zone, status, results)
    index.tsx                 — Core audio → MIDI flow
  analyze/                   — Analysis display widgets
    index.tsx                 — Key/tempo/time-signature display
```

## How to Use Components

### Basic Pattern

All components follow the same patterns:

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";  // Utility for className merging

export default function Component({ prop, onAction }) {
  const [state, setState] = useState("idle");
  
  return (
    <div className="panel">
      <h3 className="stage-h3">Title</h3>
      <p>Content goes here</p>
    </div>
  );
}
```

### Token Usage

All components use design tokens as CSS variables:

```tsx
<div style={{ background: "var(--panel)", borderRadius: "var(--r-md)" }}>
  <span className="chip">Labels and badges</span>
</div>
```

Available token categories:

| Category | CSS Var | Example |
|----------|---------|---------|
| Color | `--bg`, `--panel`, `--accent`, `--danger` | `background: var(--panel);` |
| Radius | `--r-sm` … `--r-full` | `border-radius: var(--r-lg);` |
| Spacing | `--s-1` … `--s-8` | `padding: var(--s-4);` |
| Typography | `--fs-*` — `--fs-2xl` | `font-size: var(--fs-lg);` |
| Elevation | `--shadow-*` — `--ring` | `box-shadow: var(--shadow-md);` |

## Component-by-Component Reference

### 1. Studio.tsx - Main Page Shell

**Location**: `components/Studio.tsx`

The master layout component that renders the Transcribe, Library, or Analysis tab based on `step`. Contains:

- Top navigation stepper (numbered 1-3)
- Hero/landing section when not signed in
- Tab-specific content areas

**Props**

```tsx
{
  initialTab?: string;      // "library", "transcribe", "analyze" (default: "transcribe")
  signedIn?: boolean;       // Auth status (default: false)
}
```

**Features**

- **Tab Navigation**: Click stepper buttons to navigate between Library, Transcribe, Analysis
- **Responsive Grid**: `app-grid` container adapts from single-column (mobile) to 2-column (desktop)
- **Auth Gating**: Shows "Sign In" button when not authenticated
- **Analysis Flow**: Handles results propagation from Transcribe → Analysis via callbacks

**Component States**

```tsx
// Core state
const [step, setStep] = useState<StepId>("transcribe");  // Current active tab
const [lastResult, setLastResult] = useState<TranscribeResult | null>(null);  // Last transcription
const [analysis, setAnalysis] = useState(null);  // Analysis results
const [analysisError, setAnalysisError] = useState("");  // Analysis error messages
```

**Notes**

- Uses `router.replace()` for smooth navigation without page reloads
- All content rendered via tab condition checks (`{step === "library" && ...}`)
- Analysis section has error handling with danger styling

---

### 2. Transcribe/index.tsx - Audio Transcription Interface

**Location**: `components/transcribe/index.tsx`

Primary audio processing interface that handles upload, enhancement, transcription, and result display.

**Workflow States**

| State | UI | Description |
|-------|----|-------------|
| "idle" | Empty state with upload/recording controls | Initial user interaction |
| "enhancing" | "Cleaning audio…" status | Run ffmpeg pipeline (denoise, declip, normalize) |
| "transcribing" | "Transcribing…" status | basic-pitch to MIDI conversion |
| "populated" | Results with Piano Roll + Sheet Music | Display notes, download MIDI |
| "error" | Error message with retry button | User feedback for failures |

**Component Props**

```tsx
{
  compact?: boolean;         // Minimal UI for embedded contexts
  signedIn?: boolean;        // Auth status
  onTranscribed?: (result, name) => void;  // Callback when transcription completes
  onGoToAnalyze?: () => void;  // Navigate to Analysis tab
  onAnalyze?: (audioBase64, fmt, name) => void;  // Trigger analysis
}
```

**Key Features**

- **Dual Entry Points**: Library file selection OR direct upload OR recording
- **Audio Enhancement**: Runs ffmpeg pipeline for denoising, declipping, normalization
- **Library Integration**: Direct fetch of library files for processing
- **Recording Support**: In-browser audio recording with WEBM blob processing
- **File Format Detection**: Automatic format detection from MIME type or name extension

**State Management**

```tsx
// Core transcription state
const [state, setState] = useState<State>("idle");
const [result, setResult] = useState<TranscribeResult | null>(null);
const [audioName, setAudioName] = useState("");
const [cleanAudio, setCleanAudio] = useState(null);  // Enhanced audio for reanalysis
```

**Component Patterns**

- **Drop Zone**: Used for file uploads in Library and landing pages
- **MediaRecorder**: Native browser recording with real-time visualization
- **Audio Context**: Custom playback controls with waveform visualization

**Accessibility**

- Uses semantic HTML structure
- ARIA labels for interactive elements
- Keyboard navigation support

---

### 3. Score.tsx - Sheet Music Renderer

**Location**: `components/Score.tsx`

Renders abcjs sheet music with interactive playback controls and audio visualization.

**Features**

- **abcjs Integration**: Full abcjs rendering with responsive layout
- **Audio Player**: Native browser audio controls with waveform visualization
- **Interactive Cursor**: Highlights current note in piano roll and sheet music
- **Responsive**: Scales properly on mobile and desktop

**Props**

```tsx
{
  notes: TranscribeResult["notes"];      // Note data from transcription
  analysis?: TranscribeResult["analysis"];  // Optional analysis data
  audioBase64?: string;  // Audio data for playback
  onAnalysis?: (result) => void;  // Analysis completion callback
}
```

**Component Patterns**

- **abcjs Configuration**: Custom styling for score appearance
- **Audio Sync**: Real-time sync between playback and piano roll highlighting
- **Error Handling**: Graceful fallback when abcjs fails to load

---

### 4. PianoRoll.tsx - Interactive Piano Keyboard

**Location**: `components/PianoRoll.tsx`

Interactive piano keyboard that displays notes from transcription and allows user interaction for melody input.

**Features**

- **Visual Display**: Piano keys with color coding (white/black keys)
- **Note Highlighting**: Current playback position is visually indicated
- **Responsive**: Touch support for mobile devices
- **Data Binding**: Notes from transcription with velocity/playing time mapping

**Props**

```tsx
{
  notes: {
    pitch: number;      // MIDI pitch number
    start: number;       // Start time in seconds
    end: number;         // End time in seconds  
    velocity: number;    // Note velocity (volume)
  }[];
}
```

**Component Patterns**

- **Canvas/SVG Rendering**: Visual piano representation
- **CSS Grid**: Layout of piano keys with proper spacing
- **Animation**: Smooth scrolling and highlighting animations

---

### 5. Analysis/index.tsx - Music Analysis Display

**Location**: `components/analyze/index.tsx`

Displays key/tempo/time-signature analysis results from the audio processing phase.

**Features**

- **Analysis Charts**: Visual representation of musical analysis
- **Confidence Indicators**: Shows analysis confidence levels
- **Responsive Layout**: Adapts to different screen sizes
- **Data Visualization**: Shows distribution of pitches, velocity, etc.

**Props**

```tsx
{
  analysis?: TranscribeResult["analysis"];  // Complete analysis result
  notes: TranscribeResult["notes"];        // Raw notes data
  audioName?: string;                       // Track name
  numNotes?: number;                         // Note count
}
```

**Component Patterns**

- **Chip Components**: Small informational labels with status colors
- **Data Tables**: Organized display of analysis metrics
- **Progress Indicators**: Shows analysis progress during computation

---

### 6. Library/index.tsx - Audio Library Manager

**Location**: `components/library/index.tsx`

Comprehensive audio file manager with upload, playback, deletion, and MusOpen integration.

**Workflow**

1. **File Upload**: Drag/drop or click to select audio files
2. **Storage**: Files stored in Supabase Storage with metadata
3. **Playback**: In-browser audio player with waveform visualization
4. **Transcription**: Select library files to process to MIDI
5. **Deletion**: Remove files with confirmation

**Component Props**

```tsx
{
  compact?: boolean;         // Minimal UI for embedded contexts
  signedIn?: boolean;        // Auth status
  onSignIn?: () => void;     // Trigger sign-in flow
}
```

**Key Features**

- **Drag & Drop**: Native file drop with visual feedback
- **Audio Playback**: HTML5 Audio with waveform visualization (Visualizer component)
- **File Management**: Upload, play, pause, delete operations
- **MusOpen Integration**: Import classical music from musopen.org
- **Responsive Design**: Mobile-friendly layout with touch support

**Component States**

- **Idle**: Upload zone with MusOpen button
- **Recording**: Real-time recording with timer display
- **MusOpen Open**: Music catalog browser for importing tracks
- **Playing**: Audio player with waveform and controls

---

### 7. Visualizer.tsx - Audio Waveform Display

**Location**: `components/Visualizer.tsx`

Visual waveform display for audio playback with real-time updating.

**Features**

- **Canvas Rendering**: Progressive waveform drawing
- **Real-time Updates**: Syncs with audio playback position
- **Responsive**: Adapts to container size
- **Performance**: Efficient drawing with requestAnimationFrame

**Props**

```tsx
{
  audioRef: React.RefObject<HTMLAudioElement>;  // Audio element reference
}
```

**Component Patterns**

- **Canvas API**: High-performance waveform rendering
- **Audio Synchronization**: Real-time position updates from audio element
- **Theming**: Uses CSS variables for colors and spacing

---

### 8. Auth.tsx & AuthProvider.tsx - Authentication

**Location**: `components/Auth.tsx`, `components/AuthProvider.tsx`

Supabase authentication using implicit OAuth flow (Google).

**Features**

- **Implicit Flow**: Uses Supabase implicit OAuth (`flowType: "implicit"`)
- **Session Management**: Browser storage with automatic renewal
- **Google Provider**: Google OAuth for authentication
- **Callback Handling**: Routes OAuth callback to `/auth/callback` (future)

**Component Patterns**

- **Context Provider**: `AuthProvider` wraps app for auth state
- **Hooks**: `useAuth()` custom hook for auth state access
- **Middleware**: Route protection based on auth status

---

### 9. Landing.tsx - Non-Auth Landing Page

**Location**: `components/Landing.tsx`

Landing page shown when user is not signed in. Provides entry point to Studio without authentication.

**Features**

- **Hero Section**: Main headline with value proposition
- **Single Column**: Mobile-first layout
- **Call to Action**: "Open Studio" button to start transcription

## Component Conventions

### Naming

- **Kebab-case** for file names: `transcribe/index.tsx`
- **PascalCase** for component names: `function Studio()`
- **camelCase** for local variables and functions

### Props Interface

```tsx
export default function ComponentName({
  prop1: string,
  prop2?: boolean,  // Optional props
  onAction?: () => void,  // Event handlers
}: ComponentNameProps) {  // TypeScript interface
```

### CSS/Styling

All components use:

1. **Design Tokens**: CSS variables from `app/globals.css`
2. **Utility Classes**: `.panel`, `.chip`, `.btn`, `.stage-h3` etc. from CSS
3. **Inline Styles**: Small, context-specific styling
4. **No Inline Styles**: No hardcoded color values or fixed dimensions

### State Management

- **Component State**: `useState` for UI state (loading, error, data)
- **Prop Drilling**: Parent components pass state/handlers as props
- **Callback Pattern**: Parent components handle async operations

### Testing

Components are tested via:

- **E2E Tests**: Playwright journeys in `tests/e2e/journey.spec.ts`
- **Unit Tests**: Vitest for component logic
- **Visual Tests**: Argos visual regression in `tests/visual/preview.spec.ts`

### Component Lifecycle

1. **Mount**: Initialize state, fetch data if needed
2. **Update**: React to prop changes, handle user interactions
3. **Unmount**: Cleanup timers, abort fetches, clear intervals
4. **Error Handling**: Try-catch blocks with user-friendly error messages

## Adding New Components

### 1. Create Directory

```bash
mkdir components/<feature>
```

### 2. Create Component File

```tsx
"use client";

import { useState } from "react";

export default function ComponentName({ prop }: { prop: string }) {
  const [state, setState] = useState("idle");
  
  return (
    <div className="panel">
      <h3 className="stage-h3">Title</h3>
      <p>Content</p>
    </div>
  );
}
```

### 3. Update Dependencies

- Add component to `lib/features.ts` for feature flagging
- Add API route if backend integration needed
- Update tests if core user flow
- Add to Studio.tsx if part of main workflow

### 4. Documentation

- Add to this documentation with file location and purpose
- Specify props and behavior
- Note any special patterns used

## Component Documentation Checklist

When working with components, ensure:

- [ ] Used design tokens (no hardcoded values)
- [ ] Minimal, readable naming
- [ ] Clear props with TypeScript types
- [ ] Event handlers documented
- [ ] Error handling implemented
- [ ] Accessibility considerations
- [ ] Tested coverage (E2E + Vitest)
- [ ] Visual regression (Argos)
- [ ] Updated in component documentation

## Component Migration Guide

### Transitioning from Old Patterns

If migrating code to use design tokens:

1. **Colors**: Replace hex codes with token variables
   - `color: #c084fc;` → `color: var(--accent);`

2. **Spacing**: Replace pixel values with spacing tokens
   - `margin: 16px;` → `margin: var(--s-4);`

3. **Typography**: Use font-size and weight tokens
   - `font-size: 20px;` → `font-size: var(--fs-xl);`

4. **Radius**: Apply border-radius with radius tokens
   - `border-radius: 8px;` → `border-radius: var(--r-md);`

## Component Performance Best Practices

1. **Avoid Unnecessary Re-renders**: Use `React.memo` for pure components
2. **Debounce Searches**: Debounce search/filter inputs
3. **Lazy Load**: Use React.lazy() for non-critical components
4. **Memoize Props**: Use `useMemo` for expensive calculations
5. **Cleanup**: Clear intervals/timeouts on unmount

## Component Testing Guide

To test components locally:

```bash
# Run Playwright E2E tests (includes component journeys)
npx playwright test tests/e2e/journey.spec.ts

# Run only component unit tests
npm test

# Run visual regression tests (screenshots vs baseline)
npx playwright test tests/visual/preview.spec.ts
```

## Component Guidelines Summary

- **One component per file**: `components/feature/` pattern
- **Props as contracts**: Clear interfaces for all component inputs
- **Tokens everywhere**: Never hardcode colors, spacing, or sizes
- **Testable components**: Isolated logic, mock dependencies
- **Accessible implementation**: ARIA labels, keyboard navigation
- **Performance conscious**: Minimize re-renders, cleanup side-effects
- **Documented behavior**: Props, states, and interactions documented

All components follow the same patterns, making them predictable and maintainable across the codebase.
