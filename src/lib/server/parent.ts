import "server-only";
import type { Channel, ParentStatus } from "@/generated/prisma/client";
import { cardLines, displayName, type TrustLabel } from "@/flow/display";
import { firstName } from "@/flow/state";
import { DELETE_MEDIA_AFTER_DAYS, daysFromNow } from "@/lib/retention";
import { canTransition, nextStatus } from "@/lib/status";
import { stateFromStory } from "@/lib/story-data";
import { writeAudit } from "./audit";
import { trackServer } from "./track";
import { db } from "./db";
import { parentConsentEmail } from "./email/templates";
import { sendLogged } from "./email/send";
import { createToken, newRemoveToken, peekToken, useToken } from "./tokens";
import { CHANNELS } from "@/flow/options";

/**
 * The parent or carer decision (PRD 9.1, 14). A 14 to 17 year old's story stays private until a
 * parent or carer approves it through the link in their email. They can approve, approve with no
 * name shown, or decline. Their email address is never shown here.
 */

export type ParentDecision = "approve" | "approve_anonymous" | "decline";


export interface ParentView {
  firstName: string;
  headline: string;
  story: string;
  /** The quote card as it would appear. */
  card: { quote: string; name: string; then: string; now?: string; trust: TrustLabel };
  channels: Channel[];
  /** Set once a decision has been made. */
  decided: Exclude<ParentStatus, "pending" | "not_needed"> | null;
}

export type ParentViewResult = { ok: true; view: ParentView } | { ok: false; reason: "not_found" | "expired" };

async function load(storyId: string) {
  return db.story.findUnique({ where: { id: storyId }, include: { consent: true } });
}

/** What the parent sees. Looking doesn't use up the link. */
export async function parentView(rawToken: string): Promise<ParentViewResult> {
  const check = await peekToken(db, rawToken, "parent_decision");
  if (!check.ok) return check;
  const story = check.token.storyId ? await load(check.token.storyId) : null;
  if (!story?.consent || story.consent.parentStatus === "not_needed") return { ok: false, reason: "not_found" };
  const status = story.consent.parentStatus;
  const state = stateFromStory(story);
  return {
    ok: true,
    view: {
      firstName: firstName(state),
      headline: story.headline ?? "",
      story: story.story ?? "",
      card: {
        quote: story.pullQuote ?? "",
        name: displayName(state),
        trust: story.trustLabel,
        ...cardLines(state),
      },
      channels: story.consent.channels,
      decided: status === "pending" ? null : status,
    },
  };
}

export type ParentDecisionResult =
  | { ok: true; decided: Exclude<ParentStatus, "pending" | "not_needed">; already: boolean }
  | { ok: false; reason: "not_found" | "expired" };

const STATUS_FOR: Record<ParentDecision, Exclude<ParentStatus, "pending" | "not_needed">> = {
  approve: "approved",
  approve_anonymous: "approved_anonymous",
  decline: "declined",
};

/**
 * Records the decision once. Approving moves the story on to review (or waits for the young
 * person to confirm their email); approving with no name sets the name to "Anonymous"; declining
 * rejects the story and schedules its media for deletion. A second answer is ignored.
 */
export async function decideAsParent(rawToken: string, decision: ParentDecision): Promise<ParentDecisionResult> {
  let decided: string | null = null;
  const result = await db.$transaction(async (tx): Promise<ParentDecisionResult> => {
    const check = await useToken(tx, rawToken, "parent_decision");
    if (!check.ok) return check;
    const story = check.token.storyId
      ? await tx.story.findUnique({ where: { id: check.token.storyId }, include: { consent: true } })
      : null;
    if (!story?.consent || story.consent.parentStatus === "not_needed") return { ok: false, reason: "not_found" };
    if (story.consent.parentStatus !== "pending") {
      return { ok: true, decided: story.consent.parentStatus, already: true };
    }

    const parentStatus = STATUS_FOR[decision];
    await tx.consent.update({ where: { id: story.consent.id }, data: { parentStatus, parentDecidedAt: new Date() } });
    const event = decision === "decline" ? "parent_declined" : "parent_approved";
    // A story held for safeguarding keeps its status; the decision is recorded for when it is cleared.
    const status = canTransition(story.status, event) ? nextStatus(story.status, event) : story.status;
    await tx.story.update({
      where: { id: story.id },
      data: { status, ...(decision === "approve_anonymous" ? { displayChoice: "anon" } : {}) },
    });
    if (decision === "decline") {
      await tx.media.updateMany({
        where: { storyId: story.id, deletedAt: null },
        data: { deleteAfter: daysFromNow(DELETE_MEDIA_AFTER_DAYS) },
      });
    }
    await writeAudit(tx, {
      storyId: story.id,
      actorType: "parent",
      action: `parent_${parentStatus}`,
      payload: { status, ...(decision === "decline" ? { reason: "Parent declined" } : {}) },
    });
    decided = story.id;
    return { ok: true, decided: parentStatus, already: false };
  });
  if (decided) void trackServer(decided, "parent_decision", { decision });
  return result;
}

/**
 * Emails the parent or carer a fresh decision link (PRD 14). Sent once the pre-screen clears the
 * story, when the team clears a safeguarding review, or when the team resends it (Q25). Earlier
 * links stop working. Returns false if there is nothing to ask.
 */
export async function sendParentRequest(storyId: string, actor: { type: "system" | "staff"; id?: string } = { type: "system" }) {
  const story = await db.story.findUnique({ where: { id: storyId }, include: { consent: true } });
  const parentEmail = story?.consent?.parentEmail;
  if (!story || !parentEmail || story.consent?.parentStatus !== "pending") return false;
  const token = await db.$transaction(async (tx) => {
    await tx.token.deleteMany({ where: { storyId, purpose: "parent_decision", usedAt: null } });
    const raw = await createToken(tx, { purpose: "parent_decision", storyId });
    await writeAudit(tx, { storyId, actorType: actor.type, actorId: actor.id ?? null, action: "parent_request_sent" });
    return raw;
  });
  return sendLogged(
    storyId,
    parentConsentEmail({
      to: parentEmail,
      firstName: story.firstName ?? "",
      headline: story.headline ?? "",
      story: story.story ?? "",
      pullQuote: story.pullQuote ?? "",
      channels: CHANNELS.filter((c) => story.consent!.channels.includes(c.value)).map((c) => c.label),
      token,
      removeToken: await newRemoveToken(db, storyId),
    }),
  );
}
