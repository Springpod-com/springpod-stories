import { toSrt, type Segment } from "@/lib/media/srt";
import { LIMITS } from "@/lib/media/checks";
import { db } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { currentStaff } from "@/lib/server/staff";

/** Captions for the approved video, as an .srt download for staff (PRD 12). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentStaff())) return jsonError(401, "unauthorised");
  const { id } = await params;
  const media = await db.media.findFirst({ where: { storyId: id, current: true, deletedAt: null, story: { status: "approved" } } });
  const segments = (media?.transcriptSegments as Segment[] | null) ?? [];
  if (!media || !segments.length) return jsonError(404, "not_found");
  return new Response(toSrt(segments, LIMITS[media.kind].maxS), {
    headers: {
      "Content-Type": "application/x-subrip; charset=utf-8",
      "Content-Disposition": `attachment; filename="story-${id}.srt"`,
      "Cache-Control": "no-store",
    },
  });
}
