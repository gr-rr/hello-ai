export const SHARP_NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const FLAT_NOTE_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function pitchOctave(pitch: number): number {
  return Math.floor(pitch / 12) - 1;
}

export function pitchToName(pitch: number): string {
  return `${SHARP_NOTE_NAMES[pitchClass(pitch)]}${pitchOctave(pitch)}`;
}

const BLACK_KEYPCS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(pc: number): boolean {
  return BLACK_KEYPCS.has(((pc % 12) + 12) % 12);
}

export type NoteInput = { pitch: number; start: number; end: number };

export function computeChroma(notes: NoteInput[]): number[] {
  const bins = new Array(12).fill(0);
  for (const n of notes) {
    const dur = Math.max(n.end - n.start, 0);
    bins[pitchClass(n.pitch)] += dur;
  }
  const max = Math.max(...bins, 1);
  return bins.map((v) => v / max);
}
