import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  const { path } = await params;
  return proxyToBackend(req, `/music/library/${path}`);
}
