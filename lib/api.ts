import { supabase } from "./supabase";

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
