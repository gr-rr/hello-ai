import { supabase } from "./supabase";
import { uploadFile, listFiles, getPublicUrl } from "./storage";

export type Track = {
  id: string;
  prompt: string;
  model: string;
  duration: number;
  guidance_scale: number;
  temperature: number;
  audio_path: string;
  created_at: string;
};

export type NewTrack = {
  prompt: string;
  blob: Blob;
  model?: string;
  duration: number;
  guidanceScale: number;
  temperature: number;
};

const AUDIO_BUCKET = "audio";

/**
 * Upload generated WAV + insert metadata row. Returns public URL or null.
 */
export async function saveTrack(t: NewTrack): Promise<string | null> {
  if (!supabase) return null;
  const fileName = `tracks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  await uploadFile(
    AUDIO_BUCKET,
    fileName,
    t.blob,
    "audio/wav",
  );
  await supabase.from("tracks").insert({
    prompt: t.prompt,
    model: t.model ?? "Xenova/musicgen-small",
    duration: t.duration,
    guidance_scale: t.guidanceScale,
    temperature: t.temperature,
    audio_path: fileName,
  });
  return getPublicUrl(AUDIO_BUCKET, fileName);
}

export async function getTracks(limit = 20): Promise<Track[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tracks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Track[];
}
