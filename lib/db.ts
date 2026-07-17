import { supabase } from "./supabase";

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

/**
 * Upload the generated WAV to Supabase Storage and insert a metadata row.
 * Returns the public URL of the stored audio, or null if Supabase isn't set up.
 */
export async function saveTrack(t: NewTrack): Promise<string | null> {
  if (!supabase) return null;

  const fileName = `tracks/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.wav`;

  const { error: upErr } = await supabase.storage
    .from("audio")
    .upload(fileName, t.blob, { contentType: "audio/wav", upsert: false });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage
    .from("audio")
    .getPublicUrl(fileName);

  const { error: insErr } = await supabase.from("tracks").insert({
    prompt: t.prompt,
    model: t.model ?? "Xenova/musicgen-small",
    duration: t.duration,
    guidance_scale: t.guidanceScale,
    temperature: t.temperature,
    audio_path: fileName,
  });
  if (insErr) throw insErr;

  return urlData.publicUrl;
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
