import "server-only";
import type { Story } from "@/generated/prisma/client";
import { CHANNELS } from "@/flow/options";
import { nextStatus } from "@/lib/status";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import {
  ageBand,
  mediaSummary,
  storyFields,
  submissionError,
  toTurns,
  type DraftAnswers,
  type Submission,
  type SubmissionError,
} from "@/lib/story-data";
import { writeAudit } from "./audit";
import { db } from "./db";
import { emailProvider } from "./email";
import { currentMedia, purgeStoryMedia } from "./media";
import { confirmEmail } from "./email/templates";
import { createToken, useToken } from "./tokens";

/**
 * PLACEHOLDER: version of the terms people agree to on the confirm screen.
 * The full terms text is copy gap G16.
 */
export const TERMS_VERSION = "draft-2026-10";

const today = () => new Date(new Date().toISOString().slice(0, 10));

function findDraft(deviceHash: string) {
  return db.story.findFirst({ where: { deviceIdHash: deviceHash, status: "draft" }, orderBy: { updatedAt: "desc" } });
}

const draftIds = async (deviceHash: string) =>
  (await db.story.findMany({ where: { deviceIdHash: deviceHash, status: "draft" }, select: { id: true } })).map((s) => s.id);

export async function getDraft(deviceHash: string): Promise<Story | null> {
  return findDraft(deviceHash);
}

export type SaveResult = { saved: true; storyId: string } | { saved: false; reason: "no_age" | "under_14" };

/**
 * Autosave (PRD 4 rule 5). Nothing is stored until a valid age of 14 or over is given.
 * Choosing "Under 14" deletes any draft on this device and adds one to an anonymous daily count (PRD 9.1).
 */
export async function saveDraft(deviceHash: string, answers: DraftAnswers): Promise<SaveResult> {
  if (answers.age === "Under 14") {
    await purgeStoryMedia(await draftIds(deviceHash));
    await db.$transaction(async (tx) => {
      await tx.story.deleteMany({ where: { deviceIdHash: deviceHash, status: "draft" } });
      await tx.blockedCount.upsert({
        where: { day: today() },
        create: { day: today(), count: 1 },
        update: { count: { increment: 1 } },
      });
    });
    return { saved: false, reason: "under_14" };
  }
  if (!ageBand(answers.age)) return { saved: false, reason: "no_age" };

  const existing = await findDraft(deviceHash);
  if (existing) {
    await db.story.update({ where: { id: existing.id }, data: storyFields(answers) });
    return { saved: true, storyId: existing.id };
  }
  const story = await db.$transaction(async (tx) => {
    const created = await tx.story.create({ data: { ...storyFields(answers), deviceIdHash: deviceHash } });
    await writeAudit(tx, { storyId: created.id, actorType: "submitter", action: "draft_created" });
    return created;
  });
  return { saved: true, storyId: story.id };
}

/** "Start again": removes this device's draft. */
export async function deleteDraft(deviceHash: string): Promise<void> {
  await purgeStoryMedia(await draftIds(deviceHash));
  await db.story.deleteMany({ where: { deviceIdHash: deviceHash, status: "draft" } });
}

export type SubmitResult = { ok: true; storyId: string } | { ok: false; error: SubmissionError };

/**
 * Submit (PRD 10.1): saves the final answers and consent, moves the story on, and emails the
 * confirm link. Consent and contact details are only ever stored here, never by autosave.
 */
export async function submitStory(deviceHash: string, submission: Submission): Promise<SubmitResult> {
  const existing = await findDraft(deviceHash);
  const turns = existing
    ? toTurns(await db.interviewTurn.findMany({ where: { storyId: existing.id }, orderBy: { createdAt: "asc" } }))
    : [];
  const media = existing ? await currentMedia(existing.id) : null;
  const error = submissionError(submission, { turns, ended: existing?.interviewEndedBy != null }, mediaSummary(media));
  if (error) return { ok: false, error };

  const email = submission.email.trim().toLowerCase();
  const minor = submission.age === "14 to 17";
  const channels = CHANNELS.map((c) => c.value).filter((c) => submission.channels[c]);

  const { storyId, token, firstName } = await db.$transaction(async (tx) => {
    const submitter = await tx.submitter.upsert({ where: { email }, create: { email }, update: {} });
    const draft = await tx.story.findFirst({
      where: { deviceIdHash: deviceHash, status: "draft" },
      orderBy: { updatedAt: "desc" },
    });
    const fields = { ...storyFields(submission), promptVersion: PROMPT_VERSION, submitter: { connect: { id: submitter.id } } };
    const story = draft
      ? await tx.story.update({ where: { id: draft.id }, data: fields })
      : await tx.story.create({ data: { ...fields, deviceIdHash: deviceHash } });

    await tx.consent.create({
      data: {
        storyId: story.id,
        channels,
        termsVersion: TERMS_VERSION,
        acceptedAt: new Date(),
        marketingOptIn: submission.marketing,
        parentEmail: minor ? submission.parentEmail.trim().toLowerCase() : null,
        parentStatus: minor ? "pending" : "not_needed",
      },
    });

    let status = nextStatus(story.status, "submit");
    await tx.story.update({ where: { id: story.id }, data: { status, submittedAt: new Date() } });
    await writeAudit(tx, {
      storyId: story.id,
      actorType: "submitter",
      action: "submitted",
      payload: { channels, marketingOptIn: submission.marketing, termsVersion: TERMS_VERSION, minor },
    });

    // A safeguarding concern raised during the interview takes the story out of the normal queue (PRD 9.4).
    const concern = await tx.flag.count({ where: { storyId: story.id, type: "safeguarding", resolvedAt: null } });
    if (concern) {
      status = nextStatus(status, "safeguarding_flag");
      await tx.story.update({ where: { id: story.id }, data: { status } });
      await writeAudit(tx, { storyId: story.id, actorType: "system", action: "safeguarding_review", payload: { status } });
    } else {
      // PLACEHOLDER until milestone 6: the AI pre-screen job runs here. For now the story passes straight on.
      status = nextStatus(status, "prescreen_clear");
      await tx.story.update({ where: { id: story.id }, data: { status } });
      await writeAudit(tx, { storyId: story.id, actorType: "system", action: "prescreen_skipped", payload: { status } });
    }

    const raw = await createToken(tx, { purpose: "confirm_email", storyId: story.id, submitterId: submitter.id });
    return { storyId: story.id, token: raw, firstName: story.firstName ?? "" };
  });

  // A file left over from a different way of telling the story isn't kept.
  if (media && submission.format !== "voice" && submission.format !== "video") await purgeStoryMedia([storyId]);

  // Sent after the transaction commits. Failures are logged; resend is part of milestone 7 (emails).
  try {
    await emailProvider().send(confirmEmail({ to: email, firstName, token }));
    await writeAudit(db, { storyId, actorType: "system", action: "email_sent", payload: { template: "confirm_email" } });
  } catch (e) {
    console.error("Confirm email failed", e);
    await writeAudit(db, { storyId, actorType: "system", action: "email_failed", payload: { template: "confirm_email" } });
  }
  return { ok: true, storyId };
}

export type ConfirmResult = { ok: true; firstName: string } | { ok: false; reason: "not_found" | "expired" };

/** The confirm link (PRD 14). Safe to open more than once. */
export async function confirmStoryEmail(rawToken: string): Promise<ConfirmResult> {
  return db.$transaction(async (tx) => {
    const check = await useToken(tx, rawToken, "confirm_email");
    if (!check.ok) return { ok: false, reason: check.reason };
    const { storyId, submitterId } = check.token;
    if (!storyId || !submitterId) return { ok: false, reason: "not_found" };

    const story = await tx.story.findUniqueOrThrow({ where: { id: storyId }, include: { consent: true } });
    await tx.submitter.updateMany({
      where: { id: submitterId, emailConfirmedAt: null },
      data: { emailConfirmedAt: new Date() },
    });
    if (story.status === "awaiting_email") {
      const status = nextStatus(story.status, "email_confirmed", {
        parentPending: story.consent?.parentStatus === "pending",
      });
      await tx.story.update({ where: { id: story.id }, data: { status } });
      await writeAudit(tx, { storyId: story.id, actorType: "submitter", action: "email_confirmed", payload: { status } });
    }
    return { ok: true, firstName: story.firstName ?? "" };
  });
}
