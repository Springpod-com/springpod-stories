import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { cardDownload } from "@/lib/server/publishing";

/** The quote card link in the "Published" email: a fresh signed link to the image (PRD 14). */
export async function GET(request: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const sig = new URL(request.url).searchParams.get("sig") ?? "";
  const url = await cardDownload((await params).storyId, sig);
  if (!url) return jsonError(404, "not_found");
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
