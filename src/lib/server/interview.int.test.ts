import { describe, expect, it } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import type { Generate, InterviewEvent } from "@/lib/ai/interview";
import { QUICK_REPLIES } from "@/lib/ai/prompts";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { db } from "./db";
import { finishInterview, runInterviewTurn } from "./interview";
import { submitStory } from "./stories";

const DEVICE = "device-interview";

const sam: FlowState = {
  ...initialState,
  who: "student",
  age: "14 to 17",
  firstName: "Sam",
  expType: "Volunteering",
  role: "Children's ward",
  nowStatus: "school",
  mode: "interview",
  format: "interview",
};

async function turn(message: string | null, generate: Generate | null = null, quickReply = false) {
  const result = await runInterviewTurn(
    DEVICE,
    pickDraftAnswers(sam),
    message === null ? null : { text: message, quickReply },
    generate,
  );
  if (!result.ok) return result;
  const events: InterviewEvent[] = [];
  for await (const e of result.events) events.push(e);
  return { ok: true as const, last: events.at(-1)! };
}

const fake =
  (text: string): Generate =>
  async function* () {
    yield text;
  };

const turns = () => db.interviewTurn.findMany({ orderBy: { createdAt: "asc" } });

describe("interview (PRD 6.1)", () => {
  it("needs an age first, like autosave", async () => {
    const result = await runInterviewTurn(DEVICE, pickDraftAnswers({ ...sam, age: "" }), null, null);
    expect(result).toEqual({ ok: false, problem: "no_draft" });
  });

  it("starts, stores every turn, and continues with the next question", async () => {
    expect(await turn(null)).toMatchObject({
      last: { type: "done", text: "Hi Sam! What did a normal day look like during your volunteering?" },
    });
    await turn("I set up games for the children.");
    expect((await turns()).map((t) => [t.role, t.content])).toEqual([
      ["assistant", "Hi Sam! What did a normal day look like during your volunteering?"],
      ["user", "I set up games for the children."],
      ["assistant", "Was there one moment that really stood out? Talk me through what happened."],
    ]);
  });

  it("doesn't ask again when a question is already waiting", async () => {
    await turn(null);
    await turn(null);
    expect(await db.interviewTurn.count()).toBe(1);
  });

  it("refuses an answer before the interview has started", async () => {
    expect(await turn("Hello?")).toEqual({ ok: false, problem: "not_started" });
  });

  it("marks only the exact quick reply texts as quick replies", async () => {
    await turn(null);
    await turn(QUICK_REPLIES.skip, null, true);
    await turn("Pretending to be a quick reply", null, true);
    const users = (await turns()).filter((t) => t.role === "user");
    expect(users.map((t) => t.quickReply)).toEqual([true, false]);
  });

  it("lets people finish only after three real answers", async () => {
    await turn(null);
    await turn("One");
    await turn(QUICK_REPLIES.skip, null, true);
    await turn("Two");
    expect(await finishInterview(DEVICE)).toBe(false);
    await turn("Three");
    expect(await finishInterview(DEVICE)).toBe(true);
    expect((await db.story.findFirstOrThrow()).interviewEndedBy).toBe("user_done");
    expect(await turn("Four")).toEqual({ ok: false, problem: "ended" });
  });

  it("ends with safeguarding, flags it, and holds the story for review once sent (PRD 9.4)", async () => {
    await turn(null, fake("Hi Sam! What did you do?"));
    const last = await turn(
      "Someone shouted at me and I felt unsafe.",
      fake("I'm sorry that happened. Please talk to a trusted adult or the organiser.[[SAFEGUARDING]]"),
    );
    expect(last).toMatchObject({ last: { ended: true, safeguarding: true } });
    expect((await turns()).at(-1)?.content).toBe("I'm sorry that happened. Please talk to a trusted adult or the organiser.");
    expect((await db.story.findFirstOrThrow()).interviewEndedBy).toBe("safeguarding");
    expect(await db.flag.count({ where: { type: "safeguarding", source: "ai" } })).toBe(1);

    const submission: Submission = {
      ...pickDraftAnswers({ ...sam, draft: { headline: "H", story: "S", pullQuote: "Q", quoteOptions: ["Q"], skills: [], advice: "", sector: "" }, display: "first" }),
      channels: { platform: true, website: false, blog: false, social: false },
      email: "sam@example.com",
      parentEmail: "parent@example.com",
      terms: true,
      marketing: false,
    };
    expect(await submitStory(DEVICE, submission)).toMatchObject({ ok: true });
    const story = await db.story.findFirstOrThrow();
    expect(story.status).toBe("safeguarding_review");
    expect(story.promptVersion).toBeTruthy();
  });

  it("won't accept a story whose interview hasn't finished", async () => {
    await turn(null);
    await turn("One");
    const result = await submitStory(DEVICE, {
      ...pickDraftAnswers({ ...sam, draft: { headline: "H", story: "S", pullQuote: "Q", quoteOptions: ["Q"], skills: [], advice: "", sector: "" }, display: "first" }),
      channels: { platform: true, website: false, blog: false, social: false },
      email: "sam@example.com",
      parentEmail: "parent@example.com",
      terms: true,
      marketing: false,
    });
    expect(result).toEqual({ ok: false, error: { questionId: "story", message: "The interview needs a few more answers" } });
  });
});
