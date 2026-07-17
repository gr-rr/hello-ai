import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.MUSIC_BACKEND_URL || "https://gricci-testing.duckdns.org";

/**
 * Generic reverse-proxy to the Oracle FastAPI backend.
 * Forwards the request body/method to `BACKEND_URL + path` and returns JSON.
 */
export async function proxyToBackend(req: NextRequest, path: string) {
  try {
    const init: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.text();
      if (body) init.body = body;
    }
    const res = await fetch(`${BACKEND_URL}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as any)?.detail || "backend error" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
