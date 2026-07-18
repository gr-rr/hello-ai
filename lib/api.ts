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
    const error = typeof body === "object" && body !== null && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
    throw new Error(typeof error === "string" ? error : `Request failed: ${res.status}`);
  }
  return res.json();
}
