import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDeviceHash } from "@/lib/server/device";
import { writeDraft } from "@/lib/server/drafting";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { draftAnswersSchema } from "@/lib/story-data";

const bodySchema = z.object({ answers: draftAnswersSchema, different: z.boolean() });

/** Writes up the story, or "Try a different version" (PRD 8). Calls the AI on the server only. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await ensureDeviceHash();
  if (!rateLimit(`draft-write:${device}`, 10, 10 * 60_000) || !rateLimit(`draft-write-ip:${clientIp(request.headers)}`, 60, 60 * 60_000)) {
    return jsonError(429, "rate_limited");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const result = await writeDraft(device, parsed.data.answers, { different: parsed.data.different });
  if (!result.ok) return jsonError(409, result.problem);
  return NextResponse.json({ draft: result.draft, previousDraft: result.previousDraft, fallback: result.fallback });
}
