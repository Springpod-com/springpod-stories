import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { db } from "./db";
import { confirmStoryEmail, deleteDraft, getDraft, saveDraft, submitStory } from "./stories";

const DEVICE = "device-hash-1";

const draft = {
  headline: "My internship in Marketing",
  story: "The first day I was honestly really nervous.",
  pullQuote: "The first day I was honestly really nervous.",
  quoteOptions: ["The first day I was honestly really nervous."],
  skills: ["Communication"],
  advice: "Ask questions.",
  sector: "Marketing",
};

const adult: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Priya",
  expType: "Internship",
  role: "Marketing",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written: "I helped the team put together a short report on their customers. By Wednesday I was presenting part of it in the morning meeting, which made me really nervous, but they listened and asked questions. Someone actually used what I made. The hardest thing was asking for help. My advice: say yes to things and ask loads of questions.",
  draft,
  display: "first",
  channels: { platform: true, website: false, blog: true, social: false },
  email: "Priya@Example.com ",
  terms: true,
};

const submission = (s: FlowState): Submission => ({
  ...pickDraftAnswers(s),
  channels: s.channels,
  email: s.email,
  parentEmail: s.parentEmail,
  terms: s.terms,
  marketing: s.marketing,
});

function lastConfirmToken(): string {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  const file = readdirSync(dir).filter((f) => f.endsWith("confirm_email.json")).sort().pop()!;
  const message = JSON.parse(readFileSync(join(dir, file), "utf8")) as { text: string };
  return /\/confirm\/([\w-]+)/.exec(message.text)![1]!;
}

describe("autosave (PRD 4 rule 5)", () => {
  it("stores nothing until an age is given", async () => {
    expect(await saveDraft(DEVICE, pickDraftAnswers({ ...initialState, who: "student" }))).toEqual({
      saved: false,
      reason: "no_age",
    });
    expect(await db.story.count()).toBe(0);
  });

  it("creates one draft per device, updates it, and resumes it", async () => {
    const first = await saveDraft(DEVICE, pickDraftAnswers({ ...initialState, who: "student", age: "18 to 24" }));
    const second = await saveDraft(DEVICE, pickDraftAnswers({ ...adult }));
    expect(first).toMatchObject({ saved: true });
    expect(second).toEqual(first);
    expect(await db.story.count()).toBe(1);

    const story = await getDraft(DEVICE);
    expect(story).toMatchObject({ status: "draft", firstName: "Priya", ageBand: "age_18_24", area: "Marketing" });
    expect(await db.auditEvent.count({ where: { action: "draft_created" } })).toBe(1);
  });

  it("never stores contact details or consent while autosaving", async () => {
    await saveDraft(DEVICE, pickDraftAnswers(adult));
    expect(await db.submitter.count()).toBe(0);
    expect(await db.consent.count()).toBe(0);
  });

  it("deletes the draft and keeps only an anonymous count when the age is under 14 (PRD 9.1)", async () => {
    await saveDraft(DEVICE, pickDraftAnswers(adult));
    expect(await saveDraft(DEVICE, pickDraftAnswers({ ...adult, age: "Under 14" }))).toEqual({
      saved: false,
      reason: "under_14",
    });
    expect(await db.story.count()).toBe(0);
    const counts = await db.blockedCount.findMany();
    expect(counts).toHaveLength(1);
    expect(counts[0]!.count).toBe(1);
  });

  it("starts again by deleting the draft", async () => {
    await saveDraft(DEVICE, pickDraftAnswers(adult));
    await deleteDraft(DEVICE);
    expect(await getDraft(DEVICE)).toBeNull();
  });
});

describe("submit and confirm (PRD 10, 14)", () => {
  it("rejects an incomplete submission with the question to fix", async () => {
    const result = await submitStory(DEVICE, submission({ ...adult, terms: false }));
    expect(result).toEqual({
      ok: false,
      error: { questionId: "confirm", message: "Tick the first box to confirm it's your experience" },
    });
    expect(await db.story.count()).toBe(0);
  });

  it("saves consent, sends the confirm link, and moves to in review once confirmed", async () => {
    await saveDraft(DEVICE, pickDraftAnswers(adult));
    const result = await submitStory(DEVICE, submission(adult));
    expect(result.ok).toBe(true);

    const story = await db.story.findFirstOrThrow({ include: { consent: true, submitter: true } });
    expect(story.status).toBe("awaiting_email");
    expect(story.submitter?.email).toBe("priya@example.com");
    expect(story.submitter?.emailConfirmedAt).toBeNull();
    expect(story.consent).toMatchObject({
      channels: ["platform", "blog"],
      marketingOptIn: false,
      parentEmail: null,
      parentStatus: "not_needed",
    });
    expect(await getDraft(DEVICE)).toBeNull();

    const confirmed = await confirmStoryEmail(lastConfirmToken());
    expect(confirmed).toEqual({ ok: true, firstName: "Priya" });
    const after = await db.story.findFirstOrThrow({ include: { submitter: true } });
    expect(after.status).toBe("in_review");
    expect(after.submitter?.emailConfirmedAt).not.toBeNull();

    const actions = (await db.auditEvent.findMany({ orderBy: { createdAt: "asc" } })).map((e) => e.action);
    expect(actions).toEqual(["draft_created", "submitted", "email_sent", "prescreen_done", "email_confirmed"]);
  });

  it("is safe to open the confirm link twice", async () => {
    await submitStory(DEVICE, submission(adult));
    const token = lastConfirmToken();
    await confirmStoryEmail(token);
    expect(await confirmStoryEmail(token)).toEqual({ ok: true, firstName: "Priya" });
    expect(await db.auditEvent.count({ where: { action: "email_confirmed" } })).toBe(1);
  });

  it("refuses unknown links and stores only a hash of each token", async () => {
    await submitStory(DEVICE, submission(adult));
    expect(await confirmStoryEmail("not-a-real-token")).toEqual({ ok: false, reason: "not_found" });
    const token = await db.token.findFirstOrThrow();
    expect(token.tokenHash).not.toBe(lastConfirmToken());
  });

  it("refuses expired links", async () => {
    await submitStory(DEVICE, submission(adult));
    await db.token.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await confirmStoryEmail(lastConfirmToken())).toEqual({ ok: false, reason: "expired" });
  });

  it("holds a 14 to 17 year old's story for their parent or carer after confirming", async () => {
    const minor: FlowState = { ...adult, age: "14 to 17", parentEmail: "Parent@Example.com" };
    await submitStory(DEVICE, submission(minor));
    const story = await db.story.findFirstOrThrow({ include: { consent: true } });
    expect(story.consent).toMatchObject({ parentEmail: "parent@example.com", parentStatus: "pending" });
    await confirmStoryEmail(lastConfirmToken());
    expect((await db.story.findFirstOrThrow()).status).toBe("awaiting_parent");
  });

  it("refuses under 14s at submit too", async () => {
    const result = await submitStory(DEVICE, submission({ ...adult, age: "Under 14" }));
    expect(result).toMatchObject({ ok: false, error: { questionId: "age" } });
  });

  it("never writes an email address into the audit log", async () => {
    await submitStory(DEVICE, submission({ ...adult, age: "14 to 17", parentEmail: "parent@example.com" }));
    await confirmStoryEmail(lastConfirmToken());
    const payloads = JSON.stringify(await db.auditEvent.findMany());
    expect(payloads).not.toMatch(/@/);
  });
});
