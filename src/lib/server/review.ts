import "server-only";
import type { StoryStatus, TrustLabel } from "@/generated/prisma/client";
import { DELETE_MEDIA_AFTER_DAYS, daysFromNow } from "@/lib/retention";
import { canTransition, nextStatus } from "@/lib/status";
import { TEAM_CHECKS, type Checklist } from "./admin";
import { writeAudit } from "./audit";
import { db, type Tx } from "./db";
import { sendLogged } from "./email/send";
import { changesRequestedEmail } from "./email/templates";
import { sendParentRequest } from "./parent";
import { sendApprovedEmail } from "./publishing";
import { staffLabel, type Staff } from "@/lib/staff";
import { createToken, newRemoveToken } from "./tokens";
import { trackServer } from "./track";

const statusChanged = (storyId: string, status: StoryStatus) => void trackServer(storyId, "admin_status_changed", { status });

/**
 * The team's review actions (PRD 11.2). Every action re-reads the story, checks the rules on the
 * server and writes an audit event in the same transaction. Approve is refused while parent
 * consent is pending, a safeguarding review is open, or a team check is unticked for a story
 * with media.
 */

export type ActionResult = { ok: true; status: StoryStatus } | { ok: false; problem: string };

async function loadForReview(tx: Tx, storyId: string) {
  return tx.story.findFirst({
    where: { id: storyId, status: { not: "draft" } },
    include: {
      consent: { select: { parentStatus: true } },
      flags: { where: { type: "safeguarding", resolvedAt: null }, select: { id: true } },
      media: { where: { current: true, deletedAt: null }, select: { kind: true }, take: 1 },
      review: true,
      submitter: { select: { id: true, emailConfirmedAt: true } },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadForReview>>>;

/** Why Approve is not available, in the order the team should deal with them. Empty when it is. */
export function approveBlockers(s: Pick<Loaded, "status" | "consent" | "flags" | "media" | "review">): string[] {
  const blockers: string[] = [];
  // COPY GAP G10: these reasons are placeholders.
  if (s.consent?.parentStatus === "pending") blockers.push("Waiting for the parent or carer to approve.");
  if (s.status === "safeguarding_review" || s.flags.length) blockers.push("The safeguarding review is still open.");
  const kind = s.media[0]?.kind;
  if (kind) {
    const ticked = (s.review?.checklist as Checklist | null) ?? {};
    if (TEAM_CHECKS[kind].some((c) => !ticked[c.id])) blockers.push(`Tick every ${kind === "video" ? "video" : "voice note"} check first.`);
  }
  if (!blockers.length && !canTransition(s.status, "approve")) {
    blockers.push(
      s.status === "approved" ? "Already approved." : s.status === "rejected" ? "This story was rejected." : "This story isn't ready to approve.",
    );
  }
  return blockers;
}

async function upsertReview(tx: Tx, storyId: string, data: { checklist?: Checklist; decision?: "approved" | "changes_requested" | "rejected"; reason?: string | null; decidedBy?: string; decidedAt?: Date }) {
  await tx.review.upsert({ where: { storyId }, create: { storyId, ...data }, update: data });
}

/** Ticks or unticks one team check, saved with who and when. */
export async function setCheck(staff: Staff, storyId: string, itemId: string, checked: boolean): Promise<ActionResult> {
  return db.$transaction(async (tx) => {
    const s = await loadForReview(tx, storyId);
    const kind = s?.media[0]?.kind;
    if (!s || !kind) return { ok: false, problem: "not_found" };
    if (!TEAM_CHECKS[kind].some((c) => c.id === itemId)) return { ok: false, problem: "invalid" };
    const checklist = { ...((s.review?.checklist as Checklist | null) ?? {}) };
    if (checked) checklist[itemId] = { by: staffLabel(staff), at: new Date().toISOString() };
    else delete checklist[itemId];
    await upsertReview(tx, storyId, { checklist });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: checked ? "check_ticked" : "check_unticked", payload: { item: itemId } });
    return { ok: true, status: s.status };
  });
}

export async function approve(staff: Staff, storyId: string): Promise<ActionResult> {
  const result = await db.$transaction(async (tx): Promise<ActionResult> => {
    const s = await loadForReview(tx, storyId);
    if (!s) return { ok: false, problem: "not_found" };
    const blockers = approveBlockers(s);
    if (blockers.length) return { ok: false, problem: blockers[0]! };
    const status = nextStatus(s.status, "approve");
    await tx.story.update({ where: { id: storyId }, data: { status, approvedAt: new Date() } });
    await upsertReview(tx, storyId, { decision: "approved", reason: null, decidedBy: staffLabel(staff), decidedAt: new Date() });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "approved", payload: { status } });
    return { ok: true, status };
  });
  if (result.ok) {
    statusChanged(storyId, result.status);
    await sendApprovedEmail(storyId);
  }
  return result;
}

/** Sends the story back with a message and an edit link (PRD 11.2, 14). */
export async function requestChanges(staff: Staff, storyId: string, message: string): Promise<ActionResult> {
  const text = message.trim();
  if (!text) return { ok: false, problem: "message_required" };
  const result = await db.$transaction(async (tx) => {
    const s = await loadForReview(tx, storyId);
    if (!s?.submitter) return { ok: false as const, problem: "not_found" };
    if (!canTransition(s.status, "request_changes")) return { ok: false as const, problem: "not_allowed" };
    const status = nextStatus(s.status, "request_changes");
    await tx.story.update({ where: { id: storyId }, data: { status } });
    await upsertReview(tx, storyId, { decision: "changes_requested", reason: text, decidedBy: staffLabel(staff), decidedAt: new Date() });
    await tx.token.deleteMany({ where: { storyId, purpose: "edit_story", usedAt: null } });
    const token = await createToken(tx, { purpose: "edit_story", storyId, submitterId: s.submitter.id });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "changes_requested", payload: { status } });
    return { ok: true as const, status, token, submitterId: s.submitter.id, firstName: s.firstName ?? "" };
  });
  if (!result.ok) return result;
  statusChanged(storyId, result.status);
  // The address is read here, server side only, to send the email.
  const submitter = await db.submitter.findUniqueOrThrow({ where: { id: result.submitterId }, select: { email: true } });
  await sendLogged(storyId, changesRequestedEmail({
      to: submitter.email,
      firstName: result.firstName,
      message: text,
      token: result.token,
      removeToken: await newRemoveToken(db, storyId),
    }));
  return { ok: true, status: result.status };
}

export async function reject(staff: Staff, storyId: string, reason: string): Promise<ActionResult> {
  const text = reason.trim();
  if (!text) return { ok: false, problem: "reason_required" };
  const result = await db.$transaction(async (tx): Promise<ActionResult> => {
    const s = await loadForReview(tx, storyId);
    if (!s) return { ok: false, problem: "not_found" };
    if (!canTransition(s.status, "reject")) return { ok: false, problem: "not_allowed" };
    const status = nextStatus(s.status, "reject");
    await tx.story.update({ where: { id: storyId }, data: { status } });
    await upsertReview(tx, storyId, { decision: "rejected", reason: text, decidedBy: staffLabel(staff), decidedAt: new Date() });
    await tx.media.updateMany({ where: { storyId, deletedAt: null }, data: { deleteAfter: daysFromNow(DELETE_MEDIA_AFTER_DAYS) } });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "rejected", payload: { status, reason: text } });
    return { ok: true, status };
  });
  if (result.ok) statusChanged(storyId, result.status);
  return result;
}

/**
 * Ends a safeguarding review (PRD 9.4): resolves the open safeguarding flags and returns the story
 * to where it would have been. The parent or carer is asked now if they haven't been (M5.6).
 */
export async function clearSafeguarding(staff: Staff, storyId: string): Promise<ActionResult> {
  const result = await db.$transaction(async (tx) => {
    const s = await loadForReview(tx, storyId);
    if (!s) return { ok: false as const, problem: "not_found" };
    await tx.flag.updateMany({
      where: { storyId, type: "safeguarding", resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedBy: staffLabel(staff) },
    });
    let status = s.status;
    const held = s.status === "safeguarding_review";
    if (held) {
      status = nextStatus(s.status, "safeguarding_cleared", {
        parentPending: s.consent?.parentStatus === "pending",
        emailPending: !s.submitter?.emailConfirmedAt,
      });
      await tx.story.update({ where: { id: storyId }, data: { status } });
    }
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "safeguarding_cleared", payload: { status } });
    return { ok: true as const, status, held };
  });
  if (result.ok && result.held) statusChanged(storyId, result.status);
  if (result.ok && (await db.token.count({ where: { storyId, purpose: "parent_decision" } })) === 0) {
    await sendParentRequest(storyId, { type: "staff", id: staff.id });
  }
  return result.ok ? { ok: true, status: result.status } : result;
}

/** Sends the parent or carer a new link (Q25), for when the first one expired or went astray. */
export async function resendParent(staff: Staff, storyId: string): Promise<ActionResult> {
  const s = await db.story.findFirst({ where: { id: storyId }, select: { status: true } });
  if (!s) return { ok: false, problem: "not_found" };
  if (s.status === "safeguarding_review") return { ok: false, problem: "not_allowed" };
  const sent = await sendParentRequest(storyId, { type: "staff", id: staff.id });
  return sent ? { ok: true, status: s.status } : { ok: false, problem: "not_allowed" };
}

/** Manual verification while there is no Springpod account match (PRD 10.3). */
export async function setTrust(staff: Staff, storyId: string, trust: TrustLabel): Promise<ActionResult> {
  return db.$transaction(async (tx) => {
    const s = await tx.story.findFirst({ where: { id: storyId, status: { not: "draft" } }, select: { status: true } });
    if (!s) return { ok: false, problem: "not_found" };
    await tx.story.update({ where: { id: storyId }, data: { trustLabel: trust } });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "trust_set", payload: { trust } });
    return { ok: true, status: s.status };
  });
}

/** Marks a flag dealt with. Safeguarding flags are cleared with `clearSafeguarding` instead. */
export async function resolveFlag(staff: Staff, flagId: string): Promise<ActionResult> {
  return db.$transaction(async (tx) => {
    const flag = await tx.flag.findUnique({ where: { id: flagId }, include: { story: { select: { status: true } } } });
    if (!flag || flag.type === "safeguarding") return { ok: false, problem: "not_allowed" };
    await tx.flag.update({ where: { id: flagId }, data: { resolvedAt: new Date(), resolvedBy: staffLabel(staff) } });
    await writeAudit(tx, { storyId: flag.storyId, actorType: "staff", actorId: staff.id, action: "flag_resolved", payload: { type: flag.type } });
    return { ok: true, status: flag.story.status };
  });
}

/** What the detail page needs to show the actions: why Approve is blocked, and what else is allowed. */
export async function reviewState(storyId: string) {
  const s = await loadForReview(db, storyId);
  if (!s) return null;
  return {
    blockers: approveBlockers(s),
    canDecide: { changes: canTransition(s.status, "request_changes"), reject: canTransition(s.status, "reject") },
    safeguardingOpen: s.status === "safeguarding_review" || s.flags.length > 0,
  };
}
