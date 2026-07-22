export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

if (!SITE_URL) {
  console.warn("NEXT_PUBLIC_SITE_URL is not set — auth callbacks may fail");
}

export const AUTH_CALLBACK_URL = SITE_URL
  ? `${SITE_URL}/auth/callback`
  : "/auth/callback";
