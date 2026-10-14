import "server-only";
import { WHO } from "@/flow/options";
import { nowText } from "@/flow/display";
import { firstName, interviewAnswers, MIN_INTERVIEW_ANSWERS } from "@/flow/state";
import { claudeChat } from "@/lib/ai/claude";
import { aiConfigured, MODELS } from "@/lib/ai/client";
import { interviewTurn, type Generate, type InterviewEvent } from "@/lib/ai/interview";
import { PROMPT_VERSION, QUICK_REPLIES, type InterviewContext } from "@/lib/ai/prompts";
import { stateFromStory, toTurns, type DraftAnswers } from "@/lib/story-data";
import { writeAudit } from "./audit";
import { db } from "./db";
import { getDraft, saveDraft } from "./stories";

export const MAX_ANSWER_LENGTH = 2000;

export type InterviewProblem = "no_draft" | "ended" | "not_started";

const QUICK_REPLY_TEXTS = new Set<string>(Object.values(QUICK_REPLIES));

async function loadTurns(storyId: string) {
  return toTurns(await db.interviewTurn.findMany({ where: { storyId }, orderBy: { createdAt: "asc" } }));
}

/**
 * Takes the person's answer (or starts the interview when there is none), saves it, and
 * streams the interviewer's next message. Every turn is stored so the interview resumes.
 */
export async function runInterviewTurn(
  deviceHash: string,
  answers: DraftAnswers,
  message: { text: string; quickReply: boolean } | null,
  /** Tests pass a fake model. By default: Claude when configured, otherwise the fixed questions. */
  generate: Generate | null = aiConfigured() ? claudeChat(MODELS.fast) : null,
): Promise<{ ok: false; problem: InterviewProblem } | { ok: true; events: AsyncGenerator<InterviewEvent> }> {
  // The latest answers are saved first, so the interviewer works from what is on screen.
  const saved = await saveDraft(deviceHash, answers);
  if (!saved.saved) return { ok: false, problem: "no_draft" };
  const story = (await getDraft(deviceHash))!;
  if (story.interviewEndedBy) return { ok: false, problem: "ended" };

  const turns = await loadTurns(story.id);
  if (message) {
    if (!turns.length) return { ok: false, problem: "not_started" };
    // Only the exact quick reply texts count as quick replies.
    const quickReply = message.quickReply && QUICK_REPLY_TEXTS.has(message.text);
    await db.interviewTurn.create({
      data: { storyId: story.id, role: "user", content: message.text, quickReply },
    });
    turns.push({ role: "user", content: message.text, ...(quickReply ? { quickReply } : {}) });
  } else if (turns.at(-1)?.role === "assistant") {
    // Already waiting for an answer: nothing new to ask.
    const last = turns.at(-1)!;
    return {
      ok: true,
      events: (async function* () {
        yield { type: "done" as const, text: last.content, ended: false, safeguarding: false, fallback: false };
      })(),
    };
  }

  const state = stateFromStory(story);
  const context: InterviewContext = {
    firstName: firstName(state),
    ageBand: state.age,
    expType: state.expType,
    organisation: state.org.trim(),
    area: state.role.trim() || "an unspecified area",
    whoLabel: WHO.find((w) => w.value === state.who)?.label ?? "",
    nowText: nowText(state),
  };

  const storyId = story.id;

  async function* events(): AsyncGenerator<InterviewEvent> {
    for await (const event of interviewTurn({ context, history: turns, generate })) {
      if (event.type === "done") {
        await db.$transaction(async (tx) => {
          await tx.interviewTurn.create({ data: { storyId, role: "assistant", content: event.text } });
          if (event.ended) {
            const endedBy = event.safeguarding ? "safeguarding" : event.fallback ? "fallback_end" : "ai_end";
            await tx.story.update({ where: { id: storyId }, data: { interviewEndedBy: endedBy, promptVersion: PROMPT_VERSION } });
          }
          if (event.safeguarding) {
            // Held for the safeguarding review once submitted (PRD 6.1, 9.4). The lead is notified in milestone 6.
            await tx.flag.create({
              data: {
                storyId,
                type: "safeguarding",
                source: "ai",
                detail: "The interviewer ended the interview with safeguarding signposting.",
              },
            });
            await writeAudit(tx, { storyId, actorType: "system", action: "interview_safeguarding_end" });
          }
        });
      }
      yield event;
    }
  }
  return { ok: true, events: events() };
}

/** "I'm done, write it up": allowed once there are enough answers (PRD 6.1). */
export async function finishInterview(deviceHash: string): Promise<boolean> {
  const story = await getDraft(deviceHash);
  if (!story) return false;
  if (story.interviewEndedBy) return true;
  const turns = await loadTurns(story.id);
  if (interviewAnswers({ ...stateFromStory(story, turns) }) < MIN_INTERVIEW_ANSWERS) return false;
  await db.story.update({ where: { id: story.id }, data: { interviewEndedBy: "user_done", promptVersion: PROMPT_VERSION } });
  return true;
}

export { loadTurns };
