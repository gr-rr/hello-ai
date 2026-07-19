import { supabase } from "./supabase";
import { uploadFile, getPublicUrl, listFiles, downloadText, deleteFile, type FileMeta } from "./storage";
import { apiFetch } from "./api";

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
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
    tempo?: { bpm: number; confidence: number };
    time_signature?: { numerator: number; denominator: number; confidence: number };
    chords?: { root: string; quality: string; start: number; end: number }[];
  };
};

export type LibFile = {
  name: string;
  url: string;
  id: string;
  size?: number;
  created_at?: string;
  notes?: { pitch: number; start: number; end: number; velocity: number }[];
};

export type Transcription = {
  id: string;
  title: string;
  notes: { pitch: number; start: number; end: number; velocity: number }[];
  wav_url?: string;
  created_at?: string;
};

const LIBRARY_BUCKET = "library";
const MIDI_BUCKET = "midi";
const TRANSCRIPTIONS_BUCKET = "transcriptions";

async function userPrefix(): Promise<string> {
  const uid = await userId();
  return `library/${uid ?? "dev"}`;
}

export async function uploadToLibrary(name: string, blob: Blob): Promise<{ url: string; id: string }> {
  if (!supabase) throw new Error("Supabase not configured");
  const uid = await userId();
  if (!uid) throw new Error("Sign in to save to library");
  const fmt = (name.split(".").pop() || "wav").toLowerCase();
  const safeName = name.replace(/[^a-z0-9.\-_\u00C0-\u024F ]/gi, "_");
  const prefix = await userPrefix();
  const path = `${prefix}/${Date.now()}-${safeName}`;
  await uploadFile(LIBRARY_BUCKET, path, blob, `audio/${fmt}`, true);
  return { url: getPublicUrl(LIBRARY_BUCKET, path), id: path };
}

export async function listLibrary(): Promise<LibFile[]> {
  const uid = await userId();
  if (!uid) return [];
  const prefix = await userPrefix();
  const files = await listFiles(LIBRARY_BUCKET, prefix);
  const items = await Promise.all(
    files
      .filter((f) => !f.name.endsWith("/"))
      .map(async (f: FileMeta) => {
        const path = `${prefix}/${f.name}`;
        const displayName = f.name.replace(/^\d+-/, "").replace(/_/g, " ");
        const notesPath = `${uid}/${f.name}.json`;
        let notes;
        try {
          const raw = await downloadText(TRANSCRIPTIONS_BUCKET, notesPath);
          if (raw) notes = JSON.parse(raw);
        } catch {
          notes = undefined;
        }
        return {
          name: displayName,
          url: getPublicUrl(LIBRARY_BUCKET, path),
          id: `${prefix}/${f.name}`,
          size: f.metadata?.size,
          created_at: f.created_at,
          notes,
        };
      }),
  );
  return items;
}

export async function saveTranscription(
  id: string,
  notes: { pitch: number; start: number; end: number; velocity: number }[],
): Promise<void> {
  if (!supabase) return;
  const uid = await userId();
  if (!uid) return;
  const baseName = id.split("/").pop() ?? id;
  const path = `${uid}/${baseName}.json`;
  await uploadFile(TRANSCRIPTIONS_BUCKET, path, JSON.stringify(notes), "application/json", true);
}

export async function deleteFromLibrary(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  await deleteFile(LIBRARY_BUCKET, id);
  // also delete companion transcription file if present
  const uid = await userId();
  if (uid) {
    const baseName = id.split("/").pop() ?? id;
    try {
      await deleteFile(TRANSCRIPTIONS_BUCKET, `${uid}/${baseName}.json`);
    } catch { /* ok if none */ }
  }
}

export async function listTranscriptions(): Promise<Transcription[]> {
  const uid = await userId();
  if (!uid) return [];
  const prefix = `transcriptions/${uid}`;
  const files = await listFiles(TRANSCRIPTIONS_BUCKET, prefix);
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f: FileMeta) => {
      const path = `${prefix}/${f.name}`;
      return {
        id: path,
        title: f.name.replace(/^\d+-/, "").replace(/_/g, " ").replace(/\.json$/i, ""),
        notes: [],
        wav_url: getPublicUrl(TRANSCRIPTIONS_BUCKET, path),
        created_at: f.created_at,
      } satisfies Transcription;
    });
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

export async function analyzeAudio(
  audioBase64?: string,
  midiBase64?: string,
  fmt = "wav",
): Promise<TranscribeResult["analysis"]> {
  return apiFetch("/api/music/analyze", {
    method: "POST",
    body: JSON.stringify({ audio_base64: audioBase64, midi_base64: midiBase64, fmt }),
  }) as Promise<TranscribeResult["analysis"]>;
}

export async function listMidiFiles(): Promise<LibFile[]> {
  const uid = await userId();
  if (!uid) return [];
  const prefix = `midi/${uid}`;
  const files = await listFiles("midi", prefix);
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f: FileMeta) => {
      const path = `${prefix}/${f.name}`;
      const displayName = f.name
        .replace(/^\d+-/, "")
        .replace(/_/g, " ")
        .replace(/\.mid$/i, "");
      return {
        name: displayName,
        url: getPublicUrl("midi", path),
        id: path,
        size: f.metadata?.size,
        created_at: f.created_at,
      };
    });
}

export function midiToDataUrl(base64: string): string {
  return `data:audio/midi;base64,${base64}`;
}

export function wavToDataUrl(base64: string): string {
  return `data:audio/wav;base64,${base64}`;
}
