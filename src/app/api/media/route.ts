import { NextResponse } from "next/server";
import { ensureDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { createMedia } from "@/lib/server/media";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { createMediaSchema } from "@/lib/media/schema";

const IP_LIMIT = Number(process.env.MEDIA_RATE_LIMIT ?? 120);

/** Starts an upload for this device's draft (PRD 7). Replaces any earlier file. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await ensureDeviceHash();
  if (!rateLimit(`media:${device}`, 30, 60 * 60_000) || !rateLimit(`media-ip:${clientIp(request.headers)}`, IP_LIMIT, 60 * 60_000)) {
    return jsonError(429, "rate_limited");
  }
  const parsed = createMediaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await createMedia(device, parsed.data);
  if (!result.ok) return jsonError(result.problem === "no_draft" ? 409 : 422, result.problem, result.message);
  return NextResponse.json({ mediaId: result.mediaId, partSize: result.partSize, partCount: result.partCount }, { status: 201 });
}
