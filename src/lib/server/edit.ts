import "server-only";
import { z } from "zod";
import { nextStatus } from "@/lib/status";
import { writeAudit } from "./audit";
import { db } from "./db";
import { QUEUES, sendJob, type SendJob } from "./jobs";
import { peekToken, useToken } from "./tokens";

/**
 * Editing after the team asks for changes (PRD 11.2, build plan Q16): the link in the email opens
 * the story with the team's message; resubmitting sends it through the pre-screen again.
 */

export const editSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  story: z.string().trim().min(1).max(6000),
  pullQuote: z.string().trim().min(1).max(160),
});
export type StoryEdit = z.infer<typeof editSchema>;

export interface EditView {
  firstName: string;
  message: string;
  headline: string;
  story: string;
  pullQuote: string;
  quoteOptions: string[];
}

export type EditViewResult = { ok: true; view: EditView } | { ok: false; reason: "not_found" | "expired" | "done" };

export async function editView(rawToken: string): Promise<EditViewResult> {
  const check = await peekToken(db, rawToken, "edit_story");
  if (!check.ok) return check;
  const story = check.token.storyId
    ? await db.story.findUnique({ where: { id: check.token.storyId }, include: { review: { select: { reason: true } } } })
    : null;
  if (!story) return { ok: false, reason: "not_found" };
  if (story.status !== "changes_requested") return { ok: false, reason: "done" };
  return {
    ok: true,
    view: {
      firstName: story.firstName ?? "",
      message: story.review?.reason ?? "",
      headline: story.headline ?? "",
      story: story.story ?? "",
      pullQuote: story.pullQuote ?? "",
      quoteOptions: story.quoteOptions,
    },
  };
}

export type ResubmitResult = { ok: true } | { ok: false; reason: "not_found" | "expired" | "done" };

export async function resubmit(rawToken: string, edit: StoryEdit, send: SendJob = sendJob): Promise<ResubmitResult> {
  const result = await db.$transaction(async (tx) => {
    const check = await useToken(tx, rawToken, "edit_story");
    if (!check.ok) return check;
    const story = check.token.storyId ? await tx.story.findUnique({ where: { id: check.token.storyId } }) : null;
    if (!story) return { ok: false as const, reason: "not_found" as const };
    if (story.status !== "changes_requested") return { ok: false as const, reason: "done" as const };
    const status = nextStatus(story.status, "resubmit");
    await tx.story.update({ where: { id: story.id }, data: { ...edit, status, submittedAt: new Date() } });
    await writeAudit(tx, { storyId: story.id, actorType: "submitter", action: "resubmitted", payload: { status } });
    return { ok: true as const, storyId: story.id };
  });
  if (!result.ok) return result;
  await send(QUEUES.prescreen, { storyId: result.storyId });
  return { ok: true };
}
