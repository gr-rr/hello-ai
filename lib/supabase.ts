import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const FALLBACK_URL = "https://cijhpddqvvzyzfzmkdnn.supabase.co";
const FALLBACK_ANON = "sb_publishable_-FLJWytAadJmjJfzasSQow_Dw9wnm6o";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          // Google OAuth returns a URL hash (#access_token=...) in this project,
          // which is the implicit-flow response format. detectSessionInUrl parses
          // that hash and establishes the session via onAuthStateChange.
          flowType: "implicit",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
