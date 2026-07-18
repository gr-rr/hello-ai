import { supabase } from "./supabase";
import { uploadFile, getPublicUrl, listFiles, bucketPath, type FileMeta } from "./storage";
import { apiFetch } from "./api";

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

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

export type LibFile = {
  name: string;
  url: string;
  id: string;
  size?: number;
  created_at?: string;
};

const LIBRARY_BUCKET = "library";
const MIDI_BUCKET = "midi";

async function userPrefix(): Promise<string> {
  const uid = await userId();
  return `library/${uid ?? "dev"}`;
}

export async function uploadToLibrary(name: string, blob: Blob): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured");
  const fmt = (name.split(".").pop() || "wav").toLowerCase();
  const safeName = name.replace(/[^a-z0-9.\-_\u00C0-\u024F ]/gi, "_");
  const prefix = await userPrefix();
  const path = `${prefix}/${Date.now()}-${safeName}`;
  await uploadFile(LIBRARY_BUCKET, path, blob, `audio/${fmt}`, true);
  return getPublicUrl(LIBRARY_BUCKET, path);
}

export async function listLibrary(): Promise<LibFile[]> {
  const prefix = await userPrefix();
  const files = await listFiles(LIBRARY_BUCKET, prefix);
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f: FileMeta) => {
      const path = `${prefix}/${f.name}`;
      const displayName = f.name.replace(/^\d+-/, "").replace(/_/g, " ");
      return {
        name: displayName,
        url: getPublicUrl(LIBRARY_BUCKET, path),
        id: `${prefix}/${f.name}`,
        size: f.metadata?.size,
        created_at: f.created_at,
      };
    });
}

export async function deleteFromLibrary(id: string): Promise<void> {
  await apiFetch(`/api/music/library/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function transcribeAudio(
  dataBase64: string,
  fmt = "wav",
): Promise<TranscribeResult> {
  return apiFetch("/api/music/transcribe", {
    method: "POST",
    body: JSON.stringify({ audio_base64: dataBase64, fmt, upload: true }),
  }) as Promise<TranscribeResult>;
}

export async function enhanceAudio(
  dataBase64: string,
  fmt = "wav",
): Promise<{ wav_base64: string; url?: string }> {
  return apiFetch("/api/music/enhance", {
    method: "POST",
    body: JSON.stringify({ audio_base64: dataBase64, fmt, upload: false }),
  }) as Promise<{ wav_base64: string; url?: string }>;
}

export function midiToDataUrl(base64: string): string {
  return `data:audio/midi;base64,${base64}`;
}

export function wavToDataUrl(base64: string): string {
  return `data:audio/wav;base64,${base64}`;
}
