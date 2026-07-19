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
