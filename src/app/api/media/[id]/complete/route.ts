import { NextResponse } from "next/server";
import { currentDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { completeUpload } from "@/lib/server/media";
import { completeSchema } from "@/lib/media/schema";

/** Finishes the upload and starts the server checks. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (!device) return jsonError(404, "not_found");
  const parsed = completeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await completeUpload(device, (await params).id, parsed.data.parts);
  if (!result.ok) return jsonError(result.problem === "not_found" ? 404 : 409, result.problem);
  return NextResponse.json({ ok: true });
}
