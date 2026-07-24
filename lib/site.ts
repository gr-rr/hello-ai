export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export function getAuthCallbackUrl(next?: string): string {
  const base = SITE_URL ? `${SITE_URL}/auth/callback` : "/auth/callback";
  if (next && next !== "/") return `${base}?next=${encodeURIComponent(next)}`;
  return base;
}
