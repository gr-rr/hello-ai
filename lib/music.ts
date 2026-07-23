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
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
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
    roman_numerals?: { figure: string; root: string; quality: string; start: number; end: number }[];
    cadences?: { type: string; chords: string[]; position: number }[];
    modulations?: { from_key: string; to_key: string; position: number }[];
    voice_leading?: {
      parallel: number;
      contrary: number;
      oblique: number;
      similar: number;
      motion_summary: string;
    };
  };
};

export type LibFile = {
  name: string;
  url: string;
  id: string;
  size?: number;
  created_at?: string;
  notes?: { pitch: number; start: number; end: number; velocity: number }[];
  midi_base64?: string;
};

export type Transcription = {
  id: string;
  title: string;
  notes: { pitch: number; start: number; end: number; velocity: number }[];
  wav_url?: string;
  created_at?: string;
};

const LIBRARY_BUCKET = "library";
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

  // List existing transcription JSONs once so we only download the ones that
  // actually exist — avoids a 400/404 per library file with no saved notes.
  let notesNames = new Set<string>();
  try {
    const noteFiles = await listFiles(TRANSCRIPTIONS_BUCKET, uid);
    notesNames = new Set(noteFiles.filter((f) => !f.name.endsWith("/")).map((f) => f.name));
  } catch {
    notesNames = new Set();
  }

  const items = await Promise.all(
    files
      .filter((f) => !f.name.endsWith("/"))
      .map(async (f: FileMeta) => {
        const path = `${prefix}/${f.name}`;
        const displayName = f.name.replace(/^\d+-/, "").replace(/_/g, " ");
        // Strip extension to get the base name (e.g., "hello" from "hello.wav")
        const baseName = f.name.replace(/\.[^.]+$/, "");
        let notes;
        let midi_base64;
        if (notesNames.has(`${baseName}.json`)) {
          try {
            const raw = await downloadText(TRANSCRIPTIONS_BUCKET, `${uid}/${baseName}.json`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                notes = parsed;
              } else {
                notes = parsed.notes;
                midi_base64 = parsed.midi_base64;
              }
            }
          } catch {
            notes = undefined;
          }
        }
        return {
          name: displayName,
          url: getPublicUrl(LIBRARY_BUCKET, path),
          id: `${prefix}/${f.name}`,
          size: f.metadata?.size,
          created_at: f.created_at,
          notes,
          midi_base64,
        };
      }),
  );
  return items;
}

export async function saveTranscription(
  id: string,
  notes: { pitch: number; start: number; end: number; velocity: number }[],
  midi_base64?: string,
): Promise<void> {
  if (!supabase) return;
  const uid = await userId();
  if (!uid) return;
  // Strip audio extension so JSON is saved as <uid>/name.json (not name.wav.json)
  const baseName = (id.split("/").pop() ?? id).replace(/\.[^.]+$/, "");
  const path = `${uid}/${baseName}.json`;
  const payload = midi_base64 ? { notes, midi_base64 } : { notes };
  await uploadFile(TRANSCRIPTIONS_BUCKET, path, JSON.stringify(payload), "application/json", true);
}

export async function deleteFromLibrary(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  await deleteFile(LIBRARY_BUCKET, id);
  // also delete companion transcription file if present
  const uid = await userId();
  if (uid) {
    const baseName = (id.split("/").pop() ?? id).replace(/\.[^.]+$/, "");
    try {
      await deleteFile(TRANSCRIPTIONS_BUCKET, `${uid}/${baseName}.json`);
    } catch { /* ok if none */ }
  }
}

export async function listTranscriptions(): Promise<Transcription[]> {
  const uid = await userId();
  if (!uid) return [];
  const prefix = uid;
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
  dataBase64?: string,
  fmt = "wav",
  libraryPath?: string,
): Promise<TranscribeResult> {
  const body: Record<string, unknown> = { fmt, upload: true };
  if (libraryPath) body.library_path = libraryPath;
  else body.audio_base64 = dataBase64;
  return apiFetch("/api/music/transcribe", {
    method: "POST",
    body: JSON.stringify(body),
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
  midiBase64?: string,
): Promise<TranscribeResult["analysis"]> {
  return apiFetch("/api/music/analyze", {
    method: "POST",
    body: JSON.stringify({
      midi_base64: midiBase64,
    }),
  }) as Promise<TranscribeResult["analysis"]>;
}

export async function fetchMidiBase64(libraryId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).download(libraryId);
  if (error || !data) return null;
  return blobToBase64(data);
}
