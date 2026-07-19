import { supabase } from "./supabase";

/**
 * Generic Supabase Storage helpers — single source of truth for all buckets
 * (audio, library, midi, enhanced, analysis, datasets, adapters). Features
 * should call these instead of touching supabase.storage directly.
 */

export async function uploadFile(
  bucket: string,
  path: string,
  data: string | Blob | ArrayBuffer,
  contentType?: string,
  upsert = false,
): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, {
      contentType,
      upsert,
    });
  if (error) throw error;
}

export type FileMeta = {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  metadata?: { size?: number; mimetype?: string };
};

export async function listFiles(
  bucket: string,
  prefix = "",
): Promise<FileMeta[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data ?? []) as FileMeta[];
}

export function getPublicUrl(bucket: string, path: string): string {
  if (!supabase) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(
  bucket: string,
  path: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function downloadText(
  bucket: string,
  path: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return data.text();
}


