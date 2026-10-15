import { NextResponse } from "next/server";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { removeStory } from "@/lib/server/publishing";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

/** "Remove my story" (PRD 9.3). A POST, so email scanners opening the link don't remove anything. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  if (!rateLimit(`remove-ip:${clientIp(request.headers)}`, 30, 60 * 60_000)) return jsonError(429, "rate_limited");
  const result = await removeStory((await params).token);
  if (!result.ok) return jsonError(result.reason === "expired" ? 410 : 404, result.reason);
  return NextResponse.json({ ok: true, already: result.already });
}
