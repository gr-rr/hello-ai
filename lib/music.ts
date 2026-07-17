import { supabase } from "./supabase";
import { uploadFile, getPublicUrl, listFiles, bucketPath } from "./storage";

export type TranscribeResult = {
  notes: { pitch: number; start: number; end: number; velocity: number }[];
  num_notes: number;
  midi_base64?: string;
  wav_base64?: string;
  midi_url?: string;
  wav_url?: string;
};

const LIBRARY_BUCKET = "library";
const MIDI_BUCKET = "midi";

/**
 * Upload a raw audio file to the user's library bucket and return its public URL.
 * Namespaced under library/ so auth can be added later without a migration.
 */
export async function uploadToLibrary(name: string, blob: Blob): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured");
  const fmt = (name.split(".").pop() || "wav").toLowerCase();
  const path = bucketPath("library", `${Date.now()}-${name.replace(/[^a-z0-9.\-_]/gi, "_")}`);
  await uploadFile(LIBRARY_BUCKET, path, blob, `audio/${fmt}`, true);
  return getPublicUrl(LIBRARY_BUCKET, path);
}

export async function listLibrary(): Promise<{ name: string; url: string }[]> {
  const files = await listFiles(LIBRARY_BUCKET, "library");
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f) => ({
      name: f.name,
      url: getPublicUrl(LIBRARY_BUCKET, bucketPath("library", f.name)),
    }));
}

/** Call the backend to transcribe audio bytes -> MIDI (+ synthesized WAV). */
export async function transcribeAudio(
  dataBase64: string,
  fmt = "wav",
): Promise<TranscribeResult> {
  const res = await fetch("/api/music/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_base64: dataBase64, fmt, upload: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "transcription failed");
  return data as TranscribeResult;
}

export function midiToDataUrl(base64: string): string {
  return `data:audio/midi;base64,${base64}`;
}

export function wavToDataUrl(base64: string): string {
  return `data:audio/wav;base64,${base64}`;
}
