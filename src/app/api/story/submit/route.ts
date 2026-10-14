import { NextResponse } from "next/server";
import { ensureDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { submitStory } from "@/lib/server/stories";
import { submissionSchema } from "@/lib/story-data";

const HOUR = 60 * 60 * 1000;
// Submits per hour, per connection and per email address. Raised in automated tests.
const LIMIT = Number(process.env.SUBMIT_RATE_LIMIT ?? 10);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");

  // Each submit sends an email, so limit by address as well as by connection.
  const email = parsed.data.email.trim().toLowerCase();
  if (!rateLimit(`submit-ip:${clientIp(request.headers)}`, LIMIT, HOUR) || !rateLimit(`submit-email:${email}`, Math.ceil(LIMIT / 2), HOUR)) {
    return jsonError(429, "rate_limited");
  }

  const device = await ensureDeviceHash();
  const result = await submitStory(device, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "invalid_answer", ...result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
