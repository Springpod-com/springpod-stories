import { describe, expect, it } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import type { Story } from "@/generated/prisma/client";
import { draftAnswersSchema, pickDraftAnswers, stateFromStory, storyFields, submissionError } from "./story-data";

const priya: FlowState = {
  ...initialState,
  who: "student",
  age: "14 to 17",
  firstName: " Priya ",
  expType: "Internship",
  role: "Marketing",
  nowStatus: "working",
  nowRole: "Producer",
  nowCo: "Northern Media Co",
  nowInd: "Arts and media",
  mode: "self",
  format: "write",
  written: "I helped the team put together a short report on their customers. By Wednesday I was presenting part of it in the morning meeting, which made me really nervous, but they listened and asked questions. Someone actually used what I made. The hardest thing was asking for help. My advice: say yes to things and ask loads of questions.",
  draft: { headline: "H", story: "S", pullQuote: "Q", quoteOptions: ["Q"], skills: ["A"], advice: "Ad", sector: "Se" },
  display: "initial",
  showCo: true,
  email: "priya@example.com",
  parentEmail: "parent@example.com",
};

describe("story data", () => {
  it("saves and restores the answers that autosave keeps", () => {
    const fields = storyFields(pickDraftAnswers(priya));
    expect(fields).toMatchObject({ ageBand: "age_14_17", firstName: "Priya", area: "Marketing", nowCompany: "Northern Media Co" });
    const restored = stateFromStory({ ...(fields as unknown as Story), quoteOptions: ["Q"], skills: ["A"] });
    expect(restored).toEqual({ ...priya, firstName: "Priya", email: "", parentEmail: "" });
  });

  it("never includes contact details or consent in autosaved answers", () => {
    const answers = pickDraftAnswers(priya);
    for (const key of ["email", "parentEmail", "channels", "terms", "marketing"]) expect(answers).not.toHaveProperty(key);
  });

  it("rejects oversized or unexpected values", () => {
    expect(draftAnswersSchema.safeParse({ ...pickDraftAnswers(priya), firstName: "x".repeat(61) }).success).toBe(false);
    expect(draftAnswersSchema.safeParse({ ...pickDraftAnswers(priya), who: "admin" }).success).toBe(false);
  });

  it("checks a whole submission against the question config", () => {
    const base = { ...pickDraftAnswers(priya), channels: { platform: true, website: false, blog: false, social: false }, email: "priya@example.com", parentEmail: "parent@example.com", terms: true, marketing: false };
    expect(submissionError(base)).toBeNull();
    expect(submissionError({ ...base, parentEmail: "" })).toMatchObject({ questionId: "parent" });
    expect(submissionError({ ...base, channels: { platform: false, website: false, blog: false, social: false } })).toMatchObject({ questionId: "channels" });
    expect(submissionError({ ...base, draft: null })).toMatchObject({ questionId: "draft" });
  });
});
