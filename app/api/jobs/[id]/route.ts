import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToBackend(req, `/jobs/${id}`);
}
