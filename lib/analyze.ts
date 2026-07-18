import type { TranscribeResult } from "./music";

export type NoteStats = {
  pitchRange: { low: number; high: number; span: number };
  velocity: { avg: number; max: number; min: number };
  density: number;
  mostCommonPitch: { pitch: number; count: number };
};

export function computeNoteStats(notes: TranscribeResult["notes"]): NoteStats {
  if (!notes.length) {
    return {
      pitchRange: { low: 0, high: 0, span: 0 },
      velocity: { avg: 0, max: 0, min: 0 },
      density: 0,
      mostCommonPitch: { pitch: 0, count: 0 },
    };
  }

  let minPitch = Infinity;
  let maxPitch = -Infinity;
  let velSum = 0;
  let velMax = -Infinity;
  let velMin = Infinity;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const pitchCounts = new Map<number, number>();

  for (const n of notes) {
    if (n.pitch < minPitch) minPitch = n.pitch;
    if (n.pitch > maxPitch) maxPitch = n.pitch;
    velSum += n.velocity;
    if (n.velocity > velMax) velMax = n.velocity;
    if (n.velocity < velMin) velMin = n.velocity;
    if (n.start < minStart) minStart = n.start;
    if (n.end > maxEnd) maxEnd = n.end;
    pitchCounts.set(n.pitch, (pitchCounts.get(n.pitch) ?? 0) + 1);
  }

  let mostCommonPitch = { pitch: notes[0].pitch, count: 1 };
  for (const [pitch, count] of pitchCounts) {
    if (count > mostCommonPitch.count) {
      mostCommonPitch = { pitch, count };
    }
  }

  const duration = maxEnd - minStart || 1;

  return {
    pitchRange: { low: minPitch, high: maxPitch, span: maxPitch - minPitch },
    velocity: {
      avg: Math.round(velSum / notes.length),
      max: velMax,
      min: velMin,
    },
    density: Math.round((notes.length / duration) * 100) / 100,
    mostCommonPitch,
  };
}
