import { NextResponse } from "next/server";
import { currentDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { partUrls } from "@/lib/server/media";
import { rateLimit } from "@/lib/server/rate-limit";
import { partUrlsSchema } from "@/lib/media/schema";

/** Signed upload links for some parts of the file. Asked for again when a part is retried. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (!device) return jsonError(404, "not_found");
  if (!rateLimit(`media-parts:${device}`, 300, 60 * 60_000)) return jsonError(429, "rate_limited");
  const parsed = partUrlsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const urls = await partUrls(device, (await params).id, parsed.data.partNumbers);
  if (!urls) return jsonError(404, "not_found");
  return NextResponse.json({ parts: urls });
}
