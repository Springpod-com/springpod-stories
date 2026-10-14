import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { decideAsParent } from "@/lib/server/parent";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

const bodySchema = z.object({ decision: z.enum(["approve", "approve_anonymous", "decline"]) });

/** The parent or carer's decision (PRD 9.1). Recorded once; later answers are ignored. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  if (!rateLimit(`parent-ip:${clientIp(request.headers)}`, 30, 60 * 60_000)) return jsonError(429, "rate_limited");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await decideAsParent((await params).token, parsed.data.decision);
  if (!result.ok) return jsonError(result.reason === "expired" ? 410 : 404, result.reason);
  return NextResponse.json({ decided: result.decided, already: result.already });
}
