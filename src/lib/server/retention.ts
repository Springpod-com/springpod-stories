import "server-only";
import { ABANDONED_DRAFT_DAYS, daysFromNow, EXPIRED_TOKEN_DAYS } from "@/lib/retention";
import { writeAudit } from "./audit";
import { db } from "./db";
import { allKeys, purgeStoryMedia } from "./media";
import { deleteObjects } from "./storage";

/**
 * The daily retention sweep (PRD 9.3, acceptance criterion 12): deletes media past its
 * `deleteAfter`, the files of withdrawn assets, drafts that were never sent, and old expired links.
 */
export async function retentionSweep(now = new Date()): Promise<string> {
  // 1. Media past its time: files first, then the record is marked deleted.
  const due = await db.media.findMany({ where: { deleteAfter: { lte: now }, deletedAt: null } });
  for (const m of due) {
    await deleteObjects(allKeys(m));
    await db.media.update({ where: { id: m.id }, data: { deletedAt: now, status: "deleted", current: false, uploadId: null, storageKey: "" } });
    await writeAudit(db, { storyId: m.storyId, actorType: "system", action: "media_deleted", payload: { mediaId: m.id, reason: "retention" } });
  }

  // 2. Files of withdrawn assets (quote card images). The text stays for the audit trail.
  const withdrawn = await db.asset.findMany({ where: { withdrawnAt: { lte: now }, storageKey: { not: null } } });
  if (withdrawn.length) {
    await deleteObjects(withdrawn.map((a) => a.storageKey!));
    await db.asset.updateMany({ where: { id: { in: withdrawn.map((a) => a.id) } }, data: { storageKey: null } });
  }

  // 3. Drafts never sent (Q12, Q24).
  const stale = await db.story.findMany({
    where: { status: "draft", updatedAt: { lt: daysFromNow(-ABANDONED_DRAFT_DAYS) } },
    select: { id: true },
  });
  if (stale.length) {
    await purgeStoryMedia(stale.map((s) => s.id));
    await db.story.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  // 4. Links that expired a while ago.
  const tokens = await db.token.deleteMany({ where: { expiresAt: { lt: daysFromNow(-EXPIRED_TOKEN_DAYS) } } });

  return JSON.stringify({ media: due.length, assetFiles: withdrawn.length, drafts: stale.length, tokens: tokens.count });
}
