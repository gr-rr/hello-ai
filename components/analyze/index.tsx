"use client";

import type { TranscribeResult } from "@/lib/music";
import { computeNoteStats } from "@/lib/analyze";

type Props = {
  analysis: TranscribeResult["analysis"] | null | undefined;
  notes: TranscribeResult["notes"];
  audioName: string;
  numNotes: number;
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function tonicToIndex(tonic: string): number {
  const s = SHARP_NAMES.indexOf(tonic);
  if (s !== -1) return s;
  return FLAT_NAMES.indexOf(tonic);
}

function getDiatonicChords(tonic: string, mode: string) {
  const rootIdx = tonicToIndex(tonic);
  if (rootIdx === -1) return [];

  const isMajor = mode === "major";
  const degrees = isMajor
    ? [0, 2, 4, 5, 7, 9, 11]
    : [0, 2, 3, 5, 7, 8, 10];
  const qualities = isMajor
    ? ["major", "minor", "minor", "major", "major", "minor", "dim"]
    : ["minor", "dim", "major", "minor", "minor", "major", "major"];

  return degrees.map((d, i) => {
    const idx = (rootIdx + d) % 12;
    const root = SHARP_NAMES[idx];
    const quality = qualities[i] as "major" | "minor" | "dim";
    const label = quality === "major" ? root : `${root}${quality === "dim" ? "dim" : "m"}`;
    return { root, quality, label };
  });
}

const QUALITY_COLORS: Record<string, { bg: string; text: string }> = {
  major: { bg: "rgba(59,130,246,0.15)", text: "#93c5fd" },
  minor: { bg: "rgba(192,132,252,0.15)", text: "#c084fc" },
  dim: { bg: "rgba(239,68,68,0.15)", text: "#fca5a5" },
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(pitch: number): string {
  return NOTE_NAMES[pitch % 12];
}

export default function Analysis({ analysis, notes, audioName, numNotes }: Props) {
  if (!analysis?.key) {
    return (
      <div>
        <p className="muted">
          Analysis data will appear once the backend processing is complete.
        </p>
      </div>
    );
  }

  const chords = getDiatonicChords(analysis.key.tonic, analysis.key.mode);
  const noteStats = computeNoteStats(notes);

  const chordLabels = chords.map((c) => c.label).join(", ");
  const theoryText =
    analysis.key.mode === "major"
      ? `This piece is in ${analysis.key.tonic} major. Common chords: ${chordLabels}.`
      : `This piece is in ${analysis.key.tonic} minor. Common chords: ${chordLabels}.`;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16 }}>
        {audioName} &middot; {numNotes} notes
      </p>

      <div className="analysis-grid">
        <div className="analysis-card fade-in">
          <span className="analysis-label">Key</span>
          <span className="analysis-value">
            {analysis.key.tonic} {analysis.key.mode}
          </span>
          <div className="confidence-track">
            <div
              className="confidence-fill"
              style={{ width: `${Math.round(analysis.key.confidence * 100)}%` }}
            />
          </div>
          <span className="confidence-pct">
            {Math.round(analysis.key.confidence * 100)}%
          </span>
        </div>

        <div className="analysis-card fade-in" style={{ animationDelay: "0.05s" }}>
          <span className="analysis-label">Tempo</span>
          <span className="analysis-value">{analysis.tempo.bpm} BPM</span>
          <div className="confidence-track">
            <div
              className="confidence-fill"
              style={{ width: `${Math.round(analysis.tempo.confidence * 100)}%` }}
            />
          </div>
          <span className="confidence-pct">
            {Math.round(analysis.tempo.confidence * 100)}%
          </span>
        </div>

        <div className="analysis-card fade-in" style={{ animationDelay: "0.1s" }}>
          <span className="analysis-label">Time signature</span>
          <span className="analysis-value">
            {analysis.time_signature.numerator}/{analysis.time_signature.denominator}
          </span>
          <div className="confidence-track">
            <div
              className="confidence-fill"
              style={{
                width: `${Math.round(analysis.time_signature.confidence * 100)}%`,
              }}
            />
          </div>
          <span className="confidence-pct">
            {Math.round(analysis.time_signature.confidence * 100)}%
          </span>
        </div>
      </div>

      {chords.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <span className="analysis-label" style={{ display: "block", marginBottom: 8 }}>
            Chord Progression
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chords.map((c, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 999,
                  background: QUALITY_COLORS[c.quality].bg,
                  color: QUALITY_COLORS[c.quality].text,
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <span className="analysis-label" style={{ display: "block", marginBottom: 8 }}>
          Note Statistics
        </span>
        <div className="analysis-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="analysis-card fade-in">
            <span className="analysis-label">Pitch range</span>
            <span className="analysis-value">
              {midiToNoteName(noteStats.pitchRange.low)}&ndash;
              {midiToNoteName(noteStats.pitchRange.high)}
            </span>
            <span className="confidence-pct">
              {noteStats.pitchRange.span} semitones
            </span>
          </div>
          <div className="analysis-card fade-in" style={{ animationDelay: "0.05s" }}>
            <span className="analysis-label">Avg velocity</span>
            <span className="analysis-value">{noteStats.velocity.avg}</span>
            <span className="confidence-pct">
              range {noteStats.velocity.min}&ndash;{noteStats.velocity.max}
            </span>
          </div>
          <div className="analysis-card fade-in" style={{ animationDelay: "0.1s" }}>
            <span className="analysis-label">Note density</span>
            <span className="analysis-value">{noteStats.density}</span>
            <span className="confidence-pct">notes per second</span>
          </div>
          <div className="analysis-card fade-in" style={{ animationDelay: "0.15s" }}>
            <span className="analysis-label">Most common pitch</span>
            <span className="analysis-value">
              {midiToNoteName(noteStats.mostCommonPitch.pitch)}
            </span>
            <span className="confidence-pct">
              {noteStats.mostCommonPitch.count} occurrences
            </span>
          </div>
        </div>
      </div>

      <div
        className="panel"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--muted)",
          borderColor: "var(--border-strong)",
        }}
      >
        {theoryText}
      </div>
    </div>
  );
}
