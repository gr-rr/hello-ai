import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ record_id: string }> }
) {
  const { record_id } = await params;
  return proxyToBackend(req, `/music/library/transcription/${record_id}`);
}
