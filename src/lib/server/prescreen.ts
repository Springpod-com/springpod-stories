import "server-only";
import { claudeJson } from "@/lib/ai/claude";
import { aiConfigured, MODELS } from "@/lib/ai/client";
import { flagsFrom, patternFindings, prescreenOutputSchema, type PrescreenGenerate, type PrescreenOutput } from "@/lib/ai/prescreen";
import { prescreenPrompt } from "@/lib/ai/prompts";
import { canTransition, nextStatus } from "@/lib/status";
import { writeAudit } from "./audit";
import { db, lockStory } from "./db";
import { sendLogged } from "./email/send";
import { safeguardingEmail } from "./email/templates";
import { sendParentRequest } from "./parent";

const defaultGenerate = (): PrescreenGenerate | null =>
  aiConfigured() ? claudeJson(MODELS.balanced, prescreenOutputSchema, { effort: "low" }) : null;

/** Everything the person wrote or said: the final story, the transcript and their interview answers. */
async function storyText(storyId: string): Promise<{ text: string; organisation: string | null } | null> {
  const story = await db.story.findUnique({
    where: { id: storyId },
    include: {
      interviewTurns: { where: { role: "user", quickReply: false }, orderBy: { createdAt: "asc" } },
      media: { where: { current: true, deletedAt: null } },
    },
  });
  if (!story) return null;
  const transcript = story.media.map((m) => m.transcriptEdited ?? m.transcriptRaw ?? "").filter(Boolean);
  const parts = [
    ["Headline", story.headline],
    ["Story", story.story],
    ["Quote", story.pullQuote],
    ["Advice", story.advice],
    ["Organisation", story.organisation],
    ["Current role", [story.nowRole, story.nowCompany].filter(Boolean).join(" at ")],
    ["Transcript", transcript.join("\n")],
    ["Interview answers", story.interviewTurns.map((t) => t.content).join("\n")],
  ] as const;
  return {
    text: parts
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `${k}:\n${v}`)
      .join("\n\n"),
    organisation: story.organisation,
  };
}

/** Emails the safeguarding lead once per story. Without a lead set, the admin shows a warning (G13). */
async function notifySafeguardingLead(storyId: string) {
  const already = await db.auditEvent.count({ where: { storyId, action: { in: ["safeguarding_notified", "safeguarding_lead_missing"] } } });
  if (already) return;
  const lead = process.env.SAFEGUARDING_LEAD_EMAIL?.trim();
  if (!lead) {
    await writeAudit(db, { storyId, actorType: "system", action: "safeguarding_lead_missing" });
    return;
  }
  await sendLogged(storyId, safeguardingEmail({ to: lead, storyId }));
  await writeAudit(db, { storyId, actorType: "system", action: "safeguarding_notified" });
}

/**
 * The pre-screen job (PRD 9.4, docs/ai-prompts.md section 4). Runs after submit and after a
 * resubmit. Earlier automated flags are replaced; the team's own flags and resolved flags stay.
 * A safeguarding concern holds the story and tells the safeguarding lead; otherwise the story
 * moves on to wait for the email confirmation, or further if it is already confirmed, and the
 * parent or carer is asked.
 */
export async function runPrescreen(storyId: string, generate: PrescreenGenerate | null = defaultGenerate()): Promise<string> {
  const source = await storyText(storyId);
  if (!source) return "skipped";

  let ai: PrescreenOutput | null = null;
  if (generate) {
    try {
      const parsed = prescreenOutputSchema.safeParse(await generate(prescreenPrompt(source.text)));
      ai = parsed.success ? parsed.data : null;
    } catch (e) {
      console.error("Pre-screen failed", e instanceof Error ? e.message : e);
    }
  }
  const flags = flagsFrom(ai, patternFindings(source.text), source.organisation);

  const status = await db.$transaction(async (tx) => {
    await lockStory(tx, storyId);
    const story = await tx.story.findUniqueOrThrow({ where: { id: storyId }, include: { consent: true, submitter: true } });
    await tx.flag.deleteMany({ where: { storyId, source: { in: ["ai", "system"] }, resolvedAt: null, type: { not: "safeguarding" } } });
    // An open safeguarding flag (from the interview, or an earlier run) is kept; don't add a second.
    const openSafeguarding = await tx.flag.count({ where: { storyId, type: "safeguarding", resolvedAt: null } });
    await tx.flag.createMany({
      data: flags.filter((f) => f.type !== "safeguarding" || !openSafeguarding).map((f) => ({ ...f, storyId })),
    });

    let next = story.status;
    const concern = openSafeguarding > 0 || flags.some((f) => f.type === "safeguarding");
    if (concern && canTransition(next, "safeguarding_flag")) next = nextStatus(next, "safeguarding_flag");
    else if (!concern && next === "submitted") {
      next = nextStatus(next, "prescreen_clear");
      // The email may have been confirmed while the pre-screen ran (or before a resubmit).
      if (story.submitter?.emailConfirmedAt) {
        next = nextStatus(next, "email_confirmed", { parentPending: story.consent?.parentStatus === "pending" });
      }
    }
    if (next !== story.status) await tx.story.update({ where: { id: storyId }, data: { status: next } });
    await writeAudit(tx, {
      storyId,
      actorType: "system",
      action: "prescreen_done",
      payload: { status: next, ai: Boolean(ai), flags: flags.map((f) => f.type) },
    });
    return next;
  });

  if (status === "safeguarding_review") await notifySafeguardingLead(storyId);
  else {
    // Ask the parent or carer, once (build plan M5.6: not while held for safeguarding).
    const asked = await db.token.count({ where: { storyId, purpose: "parent_decision" } });
    if (!asked) await sendParentRequest(storyId);
  }
  return status;
}
