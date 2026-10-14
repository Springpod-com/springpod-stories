import { NextResponse } from "next/server";
import { editSchema, resubmit } from "@/lib/server/edit";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

/** Resubmits a story after the team asked for changes (PRD 11.2). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  if (!rateLimit(`edit-ip:${clientIp(request.headers)}`, 30, 60 * 60_000)) return jsonError(429, "rate_limited");
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await resubmit((await params).token, parsed.data);
  if (!result.ok) return jsonError(result.reason === "expired" ? 410 : 409, result.reason);
  return NextResponse.json({ ok: true });
}
