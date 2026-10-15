import { z } from "zod";
import { ensureDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { MAX_ANSWER_LENGTH, runInterviewTurn } from "@/lib/server/interview";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { draftAnswersSchema } from "@/lib/story-data";

const bodySchema = z.object({
  answers: draftAnswersSchema,
  message: z.object({ text: z.string().trim().min(1).max(MAX_ANSWER_LENGTH), quickReply: z.boolean() }).nullable(),
});

/**
 * One interview turn. The reply streams back as newline-delimited JSON events:
 * {"type":"delta","text":...}, {"type":"replace","text":...} and a final {"type":"done",...}.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await ensureDeviceHash();
  if (!rateLimit(`interview:${device}`, 30, 60_000) || !rateLimit(`interview-ip:${clientIp(request.headers)}`, 300, 60_000)) {
    return jsonError(429, "rate_limited");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");

  const result = await runInterviewTurn(device, parsed.data.answers, parsed.data.message);
  if (!result.ok) return jsonError(409, result.problem);

  const encoder = new TextEncoder();
  const events = result.events;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
