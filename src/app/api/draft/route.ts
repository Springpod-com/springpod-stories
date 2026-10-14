import { NextResponse } from "next/server";
import { ensureDeviceHash, currentDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { deleteDraft, getDraft, saveDraft } from "@/lib/server/stories";
import { draftAnswersSchema, stateFromStory } from "@/lib/story-data";

/** The saved draft for this device, so the person can carry on (PRD 4 rule 5). */
export async function GET() {
  const device = await currentDeviceHash();
  const story = device ? await getDraft(device) : null;
  if (!story) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ state: stateFromStory(story), savedAt: story.updatedAt });
}

/** Autosave. Creates the draft once a valid age is given. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await ensureDeviceHash();
  // Per device, and per connection so clearing cookies doesn't get round it.
  if (!rateLimit(`draft:${device}`, 120, 60_000) || !rateLimit(`draft-ip:${clientIp(request.headers)}`, 600, 60_000)) {
    return jsonError(429, "rate_limited");
  }
  const parsed = draftAnswersSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  return NextResponse.json(await saveDraft(device, parsed.data));
}

/** "Start again". */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (device) await deleteDraft(device);
  return new NextResponse(null, { status: 204 });
}
