import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const FALLBACK_URL = "https://cijhpddqvvzyzfzmkdnn.supabase.co";
const FALLBACK_ANON = "sb_publishable_-FLJWytAadJmjJfzasSQow_Dw9wnm6o";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createClient<Database>(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
