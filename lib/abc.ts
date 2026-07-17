import type { TranscribeResult } from "./music";

type Note = TranscribeResult["notes"][number];

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Convert a MIDI pitch number to an ABC note letter + accidental + octave mark.
 * Uses scientific pitch: C4 = middle C = MIDI 60. ABC octave marks:
 *   middle-C (C4) -> "C", below it "," (down an octave), above "'" (up an octave).
 */
function midiToAbc(pitch: number): string {
  const name = SHARP[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1; // C4 -> 4
  const letter = name[0];
  const accidental = name.length > 1 ? (name[1] === "#" ? "^" : "_") : "";

  // ABC octave: C4 is the reference (no mark). Each octave below adds ",", above adds "'".
  // ABC octave number = octave(scientific) - 4; negative -> "," , positive -> "'".
  const diff = octave - 4;
  let mark = "";
  if (diff < 0) mark = ",".repeat(-diff);
  else if (diff > 0) mark = "'".repeat(diff);

  return `${accidental}${letter}${mark}`;
}

/** Quantize a duration (seconds) to the nearest ABC-friendly fraction of a beat. */
function quantizeDuration(seconds: number, bpm = 120): string {
  const beat = 60 / bpm; // seconds per quarter note
  const quarters = seconds / beat; // in quarter-note units
  // Snap to 1/16 grid (0.25 quarter units).
  const grid = 0.25;
  const snapped = Math.max(grid, Math.round(quarters / grid) * grid);

  // ABC duration: default unit is 1/8 note (L: 1/8). So duration in eighths:
  const eighths = snapped * 2;
  if (Math.abs(eighths - 1) < 1e-6) return ""; // L:1/8 default, no suffix
  if (Math.abs(eighths - 2) < 1e-6) return "/"; // half (2 eighths) = L default *2
  if (Math.abs(eighths - 0.5) < 1e-6) return "//"; // sixteenth (0.5 eighth)
  if (Math.abs(eighths - 0.25) < 1e-6) return "///"; // 32nd
  if (Math.abs(eighths - 4) < 1e-6) return "2"; // whole
  if (Math.abs(eighths - 3) < 1e-6) return "3/"; // dotted half
  if (Math.abs(eighths - 1.5) < 1e-6) return "3";
  return `/${eighths}`;
}

/**
 * Build a minimal ABC string from transcribed note events.
 * Notes are sorted by start time and rendered as a single monophonic voice.
 */
export function midiNotesToAbc(
  notes: Note[],
  opts: { title?: string; bpm?: number } = {},
): string {
  const { title = "Transcription", bpm = 120 } = opts;
  if (!notes.length) {
    return `X: 1\nT: ${title}\nM: 4/4\nL: 1/8\nK: C\n`;
  }

  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const body = sorted
    .map((n) => {
      const abc = midiToAbc(n.pitch);
      const dur = quantizeDuration(Math.max(0.03, n.end - n.start), bpm);
      return `${abc}${dur}`;
    })
    .join(" ");

  return [
    "X: 1",
    `T: ${title}`,
    "M: 4/4",
    "L: 1/8",
    "Q: 1/4=" + bpm,
    "K: C",
    body + " |",
  ].join("\n");
}
