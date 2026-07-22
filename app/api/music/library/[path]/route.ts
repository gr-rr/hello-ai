import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  const { path } = await params;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return proxyToBackend(req, `/music/library/${encoded}`);
}
