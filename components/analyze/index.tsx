"use client";

import type { TranscribeResult } from "@/lib/music";
import { computeNoteStats } from "@/lib/analyze";

type Props = {
  analysis: TranscribeResult["analysis"] | null | undefined;
  notes: TranscribeResult["notes"];
  audioName: string;
  numNotes: number;
};

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES = SHARP;

function tonicToIndex(tonic: string): number {
  const s = SHARP.indexOf(tonic);
  if (s !== -1) return s;
  const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  return FLAT.indexOf(tonic);
}

function getDiatonicChords(tonic: string, mode: string) {
  const rootIdx = tonicToIndex(tonic);
  if (rootIdx === -1) return [];
  const isMajor = mode === "major";
  const degrees = isMajor ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const qualities = isMajor
    ? ["major", "minor", "minor", "major", "major", "minor", "dim"]
    : ["minor", "dim", "major", "minor", "minor", "major", "major"];
  return degrees.map((d, i) => {
    const idx = (rootIdx + d) % 12;
    const root = SHARP[idx];
    const q = qualities[i];
    const label = q === "major" ? root : `${root}${q === "dim" ? "dim" : "m"}`;
    return { label, q };
  });
}

export default function Analysis({ analysis, notes, audioName, numNotes }: Props) {
  if (!analysis?.key) {
    return (
      <p className="muted">
        Analysis data will appear once the backend processing is complete.
      </p>
    );
  }

  const chords = getDiatonicChords(analysis.key.tonic, analysis.key.mode);
  const noteStats = computeNoteStats(notes);

  const chordLabels = chords.map((c) => c.label).join(", ");
  const theoryText =
    analysis.key.mode === "major"
      ? `This piece is in ${analysis.key.tonic} major. Common chords: ${chordLabels}.`
      : `This piece is in ${analysis.key.tonic} minor. Common chords: ${chordLabels}.`;

  const cKey = Math.round(analysis.key.confidence * 100);
  const cTempo = Math.round(analysis.tempo.confidence * 100);
  const cSig = Math.round(analysis.time_signature.confidence * 100);

  return (
    <div>
      <div className="section-label">Track: {audioName}</div>

      <div className="stat-grid">
        <div className="stat fade-in">
          <span className="s-label">Key</span>
          <span className="s-value">{analysis.key.tonic} {analysis.key.mode}</span>
          <div className="confidence-track"><div className="confidence-fill" style={{ width: `${cKey}%` }} /></div>
          <span className="confidence-pct">{cKey}%</span>
        </div>
        <div className="stat fade-in" style={{ animationDelay: ".05s" }}>
          <span className="s-label">Tempo</span>
          <span className="s-value">{analysis.tempo.bpm} BPM</span>
          <div className="confidence-track"><div className="confidence-fill" style={{ width: `${cTempo}%` }} /></div>
          <span className="confidence-pct">{cTempo}%</span>
        </div>
        <div className="stat fade-in" style={{ animationDelay: ".1s" }}>
          <span className="s-label">Time signature</span>
          <span className="s-value">{analysis.time_signature.numerator}/{analysis.time_signature.denominator}</span>
          <div className="confidence-track"><div className="confidence-fill" style={{ width: `${cSig}%` }} /></div>
          <span className="confidence-pct">{cSig}%</span>
        </div>
      </div>

      <div className="section-label">Diatonic chords</div>
      <div className="chips">
        {chords.map((c, i) => (
          <span key={i} className={`chip-q ${c.q}`}>{c.label}</span>
        ))}
      </div>

      <div className="section-label">Note statistics</div>
      <div className="stat-grid">
        <div className="stat">
          <span className="s-label">Pitch range</span>
          <span className="s-value">
            {NOTE_NAMES[noteStats.pitchRange.low % 12]}–{NOTE_NAMES[noteStats.pitchRange.high % 12]}
          </span>
          <span className="confidence-pct">{noteStats.pitchRange.span} semitones</span>
        </div>
        <div className="stat">
          <span className="s-label">Note count</span>
          <span className="s-value">{notes.length}</span>
        </div>
        <div className="stat">
          <span className="s-label">Density</span>
          <span className="s-value">{noteStats.density}/s</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, borderColor: "var(--border-strong)", color: "var(--muted)", fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
        {theoryText}
      </div>
    </div>
  );
}
