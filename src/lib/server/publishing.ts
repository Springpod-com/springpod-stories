import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CHANNELS } from "@/flow/options";
import { DELETE_MEDIA_AFTER_DAYS, daysFromNow } from "@/lib/retention";
import { staffLabel, type Staff } from "@/lib/staff";
import { canTransition, nextStatus } from "@/lib/status";
import { writeAudit } from "./audit";
import { db } from "./db";
import { appUrl } from "./email";
import { sendLogged } from "./email/send";
import { approvedEmail, publishedEmail } from "./email/templates";
import { presignRead } from "./storage";
import { newRemoveToken, peekToken, useToken } from "./tokens";

/**
 * After approval (PRD 14, 9.3): the "Approved" and "Published" emails, the quote card download
 * link in the published email, and "Remove my story", which withdraws the story, marks its assets
 * withdrawn and schedules its media for deletion.
 */

async function submitterOf(storyId: string) {
  return db.story.findUnique({
    where: { id: storyId },
    select: { firstName: true, submitter: { select: { email: true } }, consent: { select: { channels: true } } },
  });
}

/** Sent once the team approves (PRD 14): where it may appear, and the remove link. */
export async function sendApprovedEmail(storyId: string) {
  const s = await submitterOf(storyId);
  if (!s?.submitter) return;
  await sendLogged(
    storyId,
    approvedEmail({
      to: s.submitter.email,
      firstName: s.firstName ?? "",
      channels: CHANNELS.filter((c) => s.consent?.channels.includes(c.value)).map((c) => c.label),
      removeToken: await newRemoveToken(db, storyId),
    }),
  );
}

const cardSecret = () => {
  const s = process.env.RENDER_SECRET ?? process.env.AUTH_SECRET;
  if (!s) throw new Error("RENDER_SECRET or AUTH_SECRET must be set");
  return s;
};
const cardSig = (storyId: string) => createHmac("sha256", cardSecret()).update(`card:${storyId}`).digest("base64url");

/** A lasting link to the latest 4:5 quote card, for the "Published" email. */
export const cardLink = (storyId: string) => appUrl(`/api/card/${storyId}?sig=${cardSig(storyId)}`);

/** Where the card link sends people: a fresh signed link to the image, while the story is published. */
export async function cardDownload(storyId: string, sig: string): Promise<string | null> {
  const expected = Buffer.from(cardSig(storyId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const story = await db.story.findUnique({ where: { id: storyId }, select: { status: true, publishedAt: true } });
  if (!story?.publishedAt || story.status !== "approved") return null;
  const card = await db.asset.findFirst({
    where: { storyId, kind: "quote_card_4x5", withdrawnAt: null, storageKey: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  return card?.storageKey ? presignRead(card.storageKey, "quote-card.png") : null;
}

export type PublishResult = { ok: true } | { ok: false; problem: string };

/** The team marks an approved story as published, with the link to share (PRD 14). */
export async function markPublished(staff: Staff, storyId: string, url: string): Promise<PublishResult> {
  let link: URL;
  try {
    link = new URL(url.trim());
    if (link.protocol !== "https:") throw new Error("https only");
  } catch {
    return { ok: false, problem: "Enter the full https:// link to the story." };
  }
  const story = await db.story.findUnique({ where: { id: storyId }, select: { status: true } });
  if (story?.status !== "approved") return { ok: false, problem: "Only approved stories can be published." };
  await db.$transaction(async (tx) => {
    await tx.story.update({ where: { id: storyId }, data: { publishedAt: new Date(), publishedUrl: link.toString() } });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "published", payload: { url: link.toString(), by: staffLabel(staff) } });
  });
  const s = await submitterOf(storyId);
  const hasCard = await db.asset.count({ where: { storyId, kind: "quote_card_4x5", withdrawnAt: null, storageKey: { not: null } } });
  if (s?.submitter) {
    await sendLogged(
      storyId,
      publishedEmail({
        to: s.submitter.email,
        firstName: s.firstName ?? "",
        url: link.toString(),
        cardUrl: hasCard ? cardLink(storyId) : null,
        removeToken: await newRemoveToken(db, storyId),
      }),
    );
  }
  return { ok: true };
}

export type RemoveView = { ok: true; headline: string; removed: boolean } | { ok: false; reason: "not_found" | "expired" };

/** What the remove page shows. Looking doesn't remove anything. */
export async function removeView(rawToken: string): Promise<RemoveView> {
  const check = await peekToken(db, rawToken, "remove_story");
  if (!check.ok) return check;
  const story = check.token.storyId ? await db.story.findUnique({ where: { id: check.token.storyId }, select: { headline: true, withdrawnAt: true } }) : null;
  if (!story) return { ok: false, reason: "not_found" };
  return { ok: true, headline: story.headline ?? "", removed: Boolean(story.withdrawnAt) };
}

export type RemoveResult = { ok: true; already: boolean } | { ok: false; reason: "not_found" | "expired" };

/**
 * "Remove my story" (PRD 9.3): the story is withdrawn (and so unpublished), its assets are marked
 * withdrawn, and its media is deleted by the retention sweep within 30 days. Safe to repeat.
 */
export async function removeStory(rawToken: string): Promise<RemoveResult> {
  return db.$transaction(async (tx) => {
    const check = await useToken(tx, rawToken, "remove_story");
    if (!check.ok) return check;
    const story = check.token.storyId ? await tx.story.findUnique({ where: { id: check.token.storyId } }) : null;
    if (!story) return { ok: false, reason: "not_found" };
    if (story.withdrawnAt) return { ok: true, already: true };
    const now = new Date();
    const status = canTransition(story.status, "withdraw") ? nextStatus(story.status, "withdraw") : story.status;
    await tx.story.update({ where: { id: story.id }, data: { status, withdrawnAt: now } });
    await tx.asset.updateMany({ where: { storyId: story.id, withdrawnAt: null }, data: { withdrawnAt: now } });
    await tx.media.updateMany({ where: { storyId: story.id, deletedAt: null }, data: { deleteAfter: daysFromNow(DELETE_MEDIA_AFTER_DAYS) } });
    // Links that act on the story stop working.
    await tx.token.deleteMany({ where: { storyId: story.id, purpose: { in: ["edit_story", "parent_decision"] }, usedAt: null } });
    await writeAudit(tx, { storyId: story.id, actorType: "submitter", action: "withdrawn", payload: { status } });
    return { ok: true, already: false };
  });
}
