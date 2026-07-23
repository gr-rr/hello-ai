export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export function getAuthCallbackUrl(): string {
  return SITE_URL ? `${SITE_URL}/auth/callback` : "/auth/callback";
}
