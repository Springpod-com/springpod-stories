import { NextResponse } from "next/server";
import { currentDeviceHash } from "@/lib/server/device";
import { jsonError, sameOrigin } from "@/lib/server/http";
import { finishInterview } from "@/lib/server/interview";

/** "I'm done, write it up". */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "forbidden");
  const device = await currentDeviceHash();
  if (!device || !(await finishInterview(device))) return jsonError(409, "not_enough_answers");
  return NextResponse.json({ ok: true });
}
