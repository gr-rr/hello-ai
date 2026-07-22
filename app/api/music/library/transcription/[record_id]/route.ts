import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ record_id: string }> }
) {
  const { record_id } = await params;
  const encoded = record_id.split("/").map(encodeURIComponent).join("/");
  return proxyToBackend(req, `/music/library/transcription/${encoded}`);
}
