import { NextResponse } from "next/server";
import { currentDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { getMedia, removeMedia, updateMedia } from "@/lib/server/media";
import { updateMediaSchema } from "@/lib/media/schema";

type Params = { params: Promise<{ id: string }> };

/** Upload, processing and transcript status. Polled by the transcript screen. */
export async function GET(_: Request, { params }: Params) {
  const device = await currentDeviceHash();
  const media = device ? await getMedia(device, (await params).id) : null;
  if (!media) return jsonError(404, "not_found");
  return NextResponse.json(media, { headers: { "Cache-Control": "no-store" } });
}

/** Saves the browser's measurements and the person's transcript edits. */
export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (!device) return jsonError(404, "not_found");
  const parsed = updateMediaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await updateMedia(device, (await params).id, parsed.data);
  if (!result.ok) return jsonError(result.problem === "not_found" ? 404 : 409, result.problem);
  return NextResponse.json({ ok: true });
}

/** Cancels the upload or removes the file. */
export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (!device || !(await removeMedia(device, (await params).id))) return jsonError(404, "not_found");
  return new NextResponse(null, { status: 204 });
}
