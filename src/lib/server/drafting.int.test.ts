import { describe, expect, it, vi } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import type { DraftGenerate } from "@/lib/ai/draft";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { pickDraftAnswers } from "@/lib/story-data";
import { db } from "./db";
import { writeDraft } from "./drafting";

const DEVICE = "device-drafting";
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const priya: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Priya",
  expType: "Internship",
  role: "Marketing",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written:
    "On my first day I was really nervous, but the team gave me a real task straight away. " +
    "By Wednesday I was presenting part of a report in their morning meeting, and someone actually used what I made. " +
    "The hardest thing was asking questions. My advice is to say yes to things.",
};

const reply = (headline: string) => ({
  headline,
  story: `${words(60)}\n\n${words(60)}`,
  quoteOptions: ["Someone actually used what I made.", "The hardest thing was asking questions.", "Say yes to things."],
  pullQuote: "Someone actually used what I made.",
  skills: ["Presenting"],
  advice: "Say yes to things.",
  sector: "Marketing",
});

describe("writing the draft (PRD 8)", () => {
  it("sends the written story to the model and saves the draft with the prompt version", async () => {
    const generate = vi.fn<DraftGenerate>(async () => reply("First version"));
    const result = await writeDraft(DEVICE, pickDraftAnswers(priya), { different: false }, generate);
    expect(result).toMatchObject({ ok: true, fallback: false, previousDraft: null, draft: { headline: "First version" } });
    const prompt = generate.mock.calls[0]![0];
    expect(prompt).toContain("About the person: Priya, 18 to 24, Student.");
    expect(prompt).toContain(`Source:\n${priya.written}`);

    const story = await db.story.findFirstOrThrow();
    expect(story).toMatchObject({ headline: "First version", pullQuote: "Someone actually used what I made.", promptVersion: PROMPT_VERSION });
    expect(await db.auditEvent.count({ where: { action: "draft_written" } })).toBe(1);
  });

  it("asks for a different angle and keeps the edited version to go back to", async () => {
    await writeDraft(DEVICE, pickDraftAnswers(priya), { different: false }, async () => reply("First version"));
    const edited = { ...priya, draft: { ...reply("First version, edited"), story: "My own edit." } };
    const generate = vi.fn<DraftGenerate>(async () => reply("Second version"));
    const result = await writeDraft(DEVICE, pickDraftAnswers(edited), { different: true }, generate);
    expect(generate.mock.calls[0]![0]).toContain("different angle and opening from this previous version: First version, edited");
    expect(result).toMatchObject({ ok: true, draft: { headline: "Second version" }, previousDraft: { headline: "First version, edited", story: "My own edit." } });
    expect((await db.story.findFirstOrThrow()).previousDraft).toMatchObject({ story: "My own edit." });
  });

  it("falls back to the person's own words when the model fails or replies badly", async () => {
    for (const generate of [async () => { throw new Error("timeout"); }, async () => ({ nonsense: true })] as DraftGenerate[]) {
      const result = await writeDraft(DEVICE, pickDraftAnswers(priya), { different: false }, generate);
      expect(result).toMatchObject({ ok: true, fallback: true, draft: { story: priya.written, headline: "My internship in Marketing" } });
    }
    // No API key: straight to the fallback.
    expect(await writeDraft(DEVICE, pickDraftAnswers(priya), { different: false }, null)).toMatchObject({ fallback: true });
  });

  it("won't write up a story that isn't finished", async () => {
    const generate = vi.fn<DraftGenerate>();
    expect(await writeDraft(DEVICE, pickDraftAnswers({ ...priya, written: "Too short." }), { different: false }, generate)).toEqual({
      ok: false,
      problem: "not_ready",
    });
    expect(await writeDraft(DEVICE, pickDraftAnswers({ ...priya, format: "video" }), { different: false }, generate)).toEqual({
      ok: false,
      problem: "not_ready",
    });
    expect(await writeDraft(DEVICE, pickDraftAnswers({ ...priya, age: "" }), { different: false }, generate)).toEqual({
      ok: false,
      problem: "no_draft",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the interview turns stored on the server, not what the browser sends", async () => {
    const interview: FlowState = { ...priya, mode: "interview", format: "interview", written: "" };
    await writeDraft(DEVICE, pickDraftAnswers(interview), { different: false }, null);
    const story = await db.story.findFirstOrThrow();
    await db.interviewTurn.createMany({
      data: [
        { storyId: story.id, role: "assistant", content: "What did a normal day look like?" },
        { storyId: story.id, role: "user", content: "I helped run the reception desk and met lots of patients." },
      ],
    });
    await db.story.update({ where: { id: story.id }, data: { interviewEndedBy: "user_done" } });
    const generate = vi.fn<DraftGenerate>(async () => reply("Interview version"));
    await writeDraft(DEVICE, pickDraftAnswers(interview), { different: false }, generate);
    expect(generate.mock.calls[0]![0]).toContain(
      "Source:\nInterviewer: What did a normal day look like?\nPriya: I helped run the reception desk and met lots of patients.",
    );
  });
});
