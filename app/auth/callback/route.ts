import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${SITE_URL}${next}`);
    }
  }

  return NextResponse.redirect(`${SITE_URL}/?error=auth_callback_failed`);
}
