export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

if (!SITE_URL) {
  console.warn("NEXT_PUBLIC_SITE_URL is not set — auth callbacks may fail");
}

export function getAuthCallbackUrl(): string {
  if (SITE_URL) return `${SITE_URL}/auth/callback`;
  if (typeof window !== "undefined") return `${window.location.origin}/auth/callback`;
  return "/auth/callback";
}
