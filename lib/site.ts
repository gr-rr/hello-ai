export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://hello-ai-wheat.vercel.app";

export const AUTH_CALLBACK_URL = `${SITE_URL}/auth/callback`;
