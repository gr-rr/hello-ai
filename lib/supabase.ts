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
          // PKCE flow (default). Google redirects with ?code= to /auth/callback,
          // which calls exchangeCodeForSession. detectSessionInUrl handles the
          // hash on the callback route. Must NOT use implicit flow — it breaks
          // the PKCE code_verifier and yields "bad_oauth_state".
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
