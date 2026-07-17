import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Public (browser-safe) Supabase config. The anon/publishable key is designed
// to be exposed client-side, so a code fallback keeps preview deployments
// working even when the Vercel Preview env vars aren't set. Production vars
// (when present) always take precedence.
const FALLBACK_URL = "https://cijhpddqvvzyzfzmkdnn.supabase.co";
const FALLBACK_ANON = "sb_publishable_-FLJWytAadJmjJfzasSQow_Dw9wnm6o";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON;

// Returns null when env vars are absent so the app degrades gracefully
// (no Supabase project connected yet).
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
