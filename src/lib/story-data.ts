// What the browser may send, and how flow answers map to database rows and back.
// Validation reuses the question config, so the server applies exactly the rules the screens show.

import { z } from "zod";
import { validationError, visibleQuestions } from "@/flow/engine";
import { AGES, type AgeOption } from "@/flow/options";
import { QUESTIONS } from "@/flow/questions";
import { initialState, type FlowState, type Turn } from "@/flow/state";
import type { AgeBand, InterviewTurn, Prisma, Story } from "@/generated/prisma/client";

const text = (max: number) => z.string().max(max);

const draftSchema = z.object({
  headline: text(160),
  story: text(6000),
  pullQuote: text(160),
  quoteOptions: z.array(text(300)).max(3),
  skills: z.array(text(60)).max(4),
  advice: text(300),
  sector: text(120),
});

/** Answers saved as people go (PRD 4 rule 5). Contact details and consent are only taken at submit. */
export const draftAnswersSchema = z.object({
  who: z.enum(["", "springpod", "student", "early", "pro"]),
  age: z.enum(["", ...AGES] as ["", ...AgeOption[]]),
  firstName: text(60),
  expType: text(120),
  role: text(120),
  org: text(120),
  nowStatus: z.enum(["", "school", "college", "uni", "apprentice", "working", "other"]),
  nowRole: text(120),
  nowCo: text(120),
  nowInd: text(120),
  mode: z.enum(["", "interview", "self"]),
  format: z.enum(["", "interview", "write", "voice", "video"]),
  written: text(12000),
  draft: draftSchema.nullable(),
  display: z.enum(["", "first", "initial", "anon"]),
  showCo: z.boolean().nullable(),
});

export type DraftAnswers = z.infer<typeof draftAnswersSchema>;

export const submissionSchema = draftAnswersSchema.extend({
  channels: z.object({ platform: z.boolean(), website: z.boolean(), blog: z.boolean(), social: z.boolean() }),
  email: text(254),
  parentEmail: text(254),
  terms: z.boolean(),
  marketing: z.boolean(),
});

export type Submission = z.infer<typeof submissionSchema>;

export function pickDraftAnswers(s: FlowState): DraftAnswers {
  return {
    who: s.who,
    age: s.age,
    firstName: s.firstName,
    expType: s.expType,
    role: s.role,
    org: s.org,
    nowStatus: s.nowStatus,
    nowRole: s.nowRole,
    nowCo: s.nowCo,
    nowInd: s.nowInd,
    mode: s.mode,
    format: s.format,
    written: s.written,
    draft: s.draft,
    display: s.display,
    showCo: s.showCo,
  };
}

const AGE_TO_BAND: Partial<Record<AgeOption, AgeBand>> = {
  "14 to 17": "age_14_17",
  "18 to 24": "age_18_24",
  "25 or over": "age_25_plus",
};
const BAND_TO_AGE = Object.fromEntries(Object.entries(AGE_TO_BAND).map(([k, v]) => [v, k])) as Record<AgeBand, AgeOption>;

export const ageBand = (age: string): AgeBand | null => AGE_TO_BAND[age as AgeOption] ?? null;

const orNull = <T extends string>(v: T | "") => (v === "" ? null : v);
const textOrNull = (v: string) => (v.trim() ? v.trim() : null);

/** Story columns for a set of answers. Never includes contact details. */
export function storyFields(a: DraftAnswers): Prisma.StoryCreateInput {
  return {
    who: orNull(a.who),
    ageBand: ageBand(a.age),
    firstName: textOrNull(a.firstName),
    expType: textOrNull(a.expType),
    area: textOrNull(a.role),
    organisation: textOrNull(a.org),
    nowStatus: orNull(a.nowStatus),
    nowRole: textOrNull(a.nowRole),
    nowCompany: textOrNull(a.nowCo),
    nowIndustry: textOrNull(a.nowInd),
    mode: orNull(a.mode),
    format: orNull(a.format),
    writtenText: textOrNull(a.written),
    headline: a.draft?.headline ?? null,
    story: a.draft?.story ?? null,
    pullQuote: a.draft?.pullQuote ?? null,
    quoteOptions: a.draft?.quoteOptions ?? [],
    skills: a.draft?.skills ?? [],
    advice: a.draft?.advice ?? null,
    sector: a.draft?.sector ?? null,
    displayChoice: orNull(a.display),
    showCompany: a.showCo,
  };
}

export const toTurns = (rows: Pick<InterviewTurn, "role" | "content" | "quickReply">[]): Turn[] =>
  rows.map((r) => ({ role: r.role, content: r.content, ...(r.quickReply ? { quickReply: true } : {}) }));

/** Rebuilds the flow state from a saved draft so the person can carry on. */
export function stateFromStory(story: Story, turns: Turn[] = []): FlowState {
  const hasDraft = story.headline !== null || story.story !== null || story.pullQuote !== null;
  return {
    ...initialState,
    who: story.who ?? "",
    age: story.ageBand ? BAND_TO_AGE[story.ageBand] : "",
    firstName: story.firstName ?? "",
    expType: story.expType ?? "",
    role: story.area ?? "",
    org: story.organisation ?? "",
    nowStatus: story.nowStatus ?? "",
    nowRole: story.nowRole ?? "",
    nowCo: story.nowCompany ?? "",
    nowInd: story.nowIndustry ?? "",
    mode: story.mode ?? "",
    format: story.format ?? "",
    written: story.writtenText ?? "",
    turns,
    interviewEnded: story.interviewEndedBy != null,
    draft: hasDraft
      ? {
          headline: story.headline ?? "",
          story: story.story ?? "",
          pullQuote: story.pullQuote ?? "",
          quoteOptions: story.quoteOptions,
          skills: story.skills,
          advice: story.advice ?? "",
          sector: story.sector ?? "",
        }
      : null,
    display: story.displayChoice ?? "",
    showCo: story.showCompany,
  };
}

/** Messages for checks that have no on-screen wording of their own (the screens prevent them). */
const SERVER_MESSAGES: Record<string, string> = {
  draft: "Your story hasn't been written up yet",
  interview: "The interview needs a few more answers",
};

export interface SubmissionError {
  questionId: string;
  message: string;
}

/**
 * Server-side check of a whole submission against the question config: every question
 * the person should have seen must be answered and valid. Returns the first problem.
 */
export function submissionError(
  s: Submission,
  interview: { turns: Turn[]; ended: boolean } = { turns: [], ended: false },
): SubmissionError | null {
  const state: FlowState = { ...initialState, ...s, transcript: "", turns: interview.turns, interviewEnded: interview.ended };
  if (state.age === "Under 14") return { questionId: "age", message: "Stories are open to people aged 14 and over" };
  for (const q of visibleQuestions(QUESTIONS, state)) {
    if (["intro", "stop", "done", "guide", "transcript"].includes(q.kind)) continue;
    const message = validationError(q, state);
    if (message) return { questionId: q.id, message: SERVER_MESSAGES[message] ?? message };
  }
  return null;
}
