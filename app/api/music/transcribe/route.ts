import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "missing authentication" }, { status: 401 });
  }
  return proxyToBackend(req, "/music/transcribe");
}
