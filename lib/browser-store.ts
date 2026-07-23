import type { TranscribeResult } from "./music";

const STORAGE_KEY = "localTranscription";

export type LocalTranscription = {
  name: string;
  notes: TranscribeResult["notes"];
  midi_base64?: string;
  audioDataUrl?: string;
  audioBlob?: Blob;
};

let cached: LocalTranscription | null = null;

export function saveLocalTranscription(
  name: string,
  notes: TranscribeResult["notes"],
  midiBase64?: string,
  audioBlob?: Blob,
): void {
  const entry: LocalTranscription = { name, notes, midi_base64: midiBase64 };

  if (audioBlob) {
    const url = URL.createObjectURL(audioBlob);
    entry.audioDataUrl = url;
    entry.audioBlob = audioBlob;
  }

  cached = entry;

  try {
    const serialized = { name, notes, midi_base64: midiBase64 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {}
}

export function loadLocalTranscription(): LocalTranscription | null {
  if (cached) return cached;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.notes || !Array.isArray(parsed.notes)) return null;
    cached = parsed;
    return cached;
  } catch {
    return null;
  }
}

export function clearLocalTranscription(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
