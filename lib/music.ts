import { supabase } from "./supabase";
import { uploadFile, getPublicUrl, listFiles, deleteFile, bucketPath } from "./storage";

export type TranscribeResult = {
  notes: { pitch: number; start: number; end: number; velocity: number }[];
  num_notes: number;
  midi_base64?: string;
  wav_base64?: string;
  midi_url?: string;
  wav_url?: string;
  analysis?: {
    key: { tonic: string; mode: string; confidence: number };
    tempo: { bpm: number; confidence: number };
    time_signature: { numerator: number; denominator: number; confidence: number };
  };
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
  const safeName = name.replace(/[^a-z0-9.\-_\u00C0-\u024F ]/gi, "_");
  const path = bucketPath("library", `${Date.now()}-${safeName}`);
  await uploadFile(LIBRARY_BUCKET, path, blob, `audio/${fmt}`, true);
  return getPublicUrl(LIBRARY_BUCKET, path);
}

export async function listLibrary(): Promise<{ name: string; url: string; id: string }[]> {
  const files = await listFiles(LIBRARY_BUCKET, "library");
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f) => {
      const path = bucketPath("library", f.name);
      const displayName = f.name.replace(/^\d+-/, "").replace(/_/g, " ");
      return {
        name: displayName,
        url: getPublicUrl(LIBRARY_BUCKET, path),
        id: f.name,
      };
    });
}

export async function deleteFromLibrary(id: string): Promise<void> {
  await deleteFile(LIBRARY_BUCKET, bucketPath("library", id));
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

/** Preprocess: denoise/declip/normalize a raw recording via the backend. */
export async function enhanceAudio(
  dataBase64: string,
  fmt = "wav",
): Promise<{ wav_base64: string; url?: string }> {
  const res = await fetch("/api/music/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_base64: dataBase64, fmt, upload: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "enhance failed");
  return data;
}

export function midiToDataUrl(base64: string): string {
  return `data:audio/midi;base64,${base64}`;
}

export function wavToDataUrl(base64: string): string {
  return `data:audio/wav;base64,${base64}`;
}
