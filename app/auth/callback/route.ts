import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    return NextResponse.redirect(
      `${SITE_URL}/auth/confirm?code=${encodeURIComponent(code)}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`,
    );
  }

  return NextResponse.redirect(`${SITE_URL}/?error=auth_callback_failed`);
}
