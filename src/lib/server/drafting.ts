import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { findQuestion, validationError } from "@/flow/engine";
import { QUESTIONS } from "@/flow/questions";
import { ownWords, sourceText } from "@/flow/source";
import type { Draft } from "@/flow/state";
import { claudeJson } from "@/lib/ai/claude";
import { aiConfigured, MODELS } from "@/lib/ai/client";
import { personContext } from "@/lib/ai/context";
import { draftFallback, draftOutputSchema, normaliseDraft, type DraftGenerate } from "@/lib/ai/draft";
import { draftPrompt, PROMPT_VERSION } from "@/lib/ai/prompts";
import { mediaSummary, stateFromStory, type DraftAnswers } from "@/lib/story-data";
import { writeAudit } from "./audit";
import { db } from "./db";
import { loadTurns } from "./interview";
import { currentMedia } from "./media";
import { getDraft, saveDraft } from "./stories";

export type WriteDraftResult =
  | { ok: true; draft: Draft; previousDraft: Draft | null; fallback: boolean }
  | { ok: false; problem: "no_draft" | "not_ready" };

const defaultGenerate = (): DraftGenerate | null =>
  aiConfigured() ? claudeJson(MODELS.balanced, draftOutputSchema) : null;

/**
 * Writes up the story (PRD 8). The answers are saved first, then the source is read back from
 * the server: interview turns, the written story or the corrected transcript. "Try a different
 * version" keeps the current draft, with the person's edits, as the previous version.
 */
export async function writeDraft(
  device: string,
  answers: DraftAnswers,
  { different }: { different: boolean },
  generate: DraftGenerate | null = defaultGenerate(),
): Promise<WriteDraftResult> {
  const saved = await saveDraft(device, answers);
  if (!saved.saved) return { ok: false, problem: "no_draft" };
  const story = await getDraft(device);
  if (!story) return { ok: false, problem: "no_draft" };

  const state = stateFromStory(story, await loadTurns(story.id), mediaSummary(await currentMedia(story.id)));
  // Only once the story step (and the transcript, for media) is complete.
  for (const id of ["story", "transcript"]) {
    const q = findQuestion(QUESTIONS, id);
    if ((id === "story" || state.format === "voice" || state.format === "video") && validationError(q, state)) {
      return { ok: false, problem: "not_ready" };
    }
  }

  const previousDraft = different ? state.draft : null;
  let draft: Draft | null = null;
  if (generate) {
    try {
      draft = normaliseDraft(
        await generate(draftPrompt(personContext(state), sourceText(state), previousDraft?.headline)),
        state.role,
      );
    } catch (e) {
      console.error("Draft generation failed", e instanceof Error ? e.message : e);
    }
  }
  const fallback = !draft;
  draft ??= draftFallback(ownWords(state), state.expType, state.role);

  await db.$transaction(async (tx) => {
    await tx.story.update({
      where: { id: story.id },
      data: {
        headline: draft.headline,
        story: draft.story,
        pullQuote: draft.pullQuote,
        quoteOptions: draft.quoteOptions,
        skills: draft.skills,
        advice: draft.advice,
        sector: draft.sector,
        // A fresh draft (not "Try a different version") has nothing to go back to.
        previousDraft: previousDraft ? { ...previousDraft } : Prisma.DbNull,
        promptVersion: PROMPT_VERSION,
      },
    });
    await writeAudit(tx, {
      storyId: story.id,
      actorType: "system",
      action: "draft_written",
      payload: { fallback, different, promptVersion: PROMPT_VERSION },
    });
  });
  return { ok: true, draft, previousDraft, fallback };
}
