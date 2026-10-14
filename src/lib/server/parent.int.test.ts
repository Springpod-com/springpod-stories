import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { db } from "./db";
import { decideAsParent, parentView } from "./parent";
import { confirmStoryEmail, saveDraft, submitStory } from "./stories";

const DEVICE = "device-parent";

const amara: FlowState = {
  ...initialState,
  who: "student",
  age: "14 to 17",
  firstName: "Amara",
  expType: "School work experience week",
  role: "Vet practice",
  nowStatus: "school",
  mode: "self",
  format: "write",
  written:
    "I spent a week at a vet practice. The best moment was helping calm a nervous dog before its check-up, and the vet said I had a natural way with animals. " +
    "The hardest part was watching a difficult operation, but I learned a lot. My advice is to ask if you can watch everything.",
  draft: {
    headline: "Calming a nervous dog",
    story: "First paragraph.\n\nSecond paragraph.",
    pullQuote: "The vet said I had a natural way with animals.",
    quoteOptions: ["The vet said I had a natural way with animals."],
    skills: [],
    advice: "",
    sector: "",
  },
  display: "first",
  channels: { platform: true, website: false, blog: true, social: false },
  email: "amara@example.com",
  parentEmail: "Parent@Example.com",
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

/** The newest email of a template, as written by the console provider. */
function lastEmail(template: string): { to: string; subject: string; text: string } {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  const file = readdirSync(dir).filter((f) => f.endsWith(`${template}.json`)).sort().pop()!;
  return JSON.parse(readFileSync(join(dir, file), "utf8"));
}
const tokenIn = (text: string, path: string) => new RegExp(`/${path}/([\\w-]+)`).exec(text)![1]!;

async function submitAmara(s: FlowState = amara) {
  await submitStory(DEVICE, submission(s));
  return tokenIn(lastEmail("parent_consent").text, "parent");
}

const status = async () => (await db.story.findFirstOrThrow()).status;

describe("parent or carer consent (PRD 9.1, 14)", () => {
  it("emails the parent at submit with the story, quote, channels and a link", async () => {
    await submitAmara();
    const email = lastEmail("parent_consent");
    expect(email.to).toBe("parent@example.com");
    expect(email.subject).toContain("Amara");
    expect(email.text).toContain("Calming a nervous dog");
    expect(email.text).toContain("First paragraph.\n\nSecond paragraph.");
    expect(email.text).toContain('"The vet said I had a natural way with animals."');
    expect(email.text).toContain("On Springpod");
    const token = await db.token.findFirstOrThrow({ where: { purpose: "parent_decision" } });
    expect(token.expiresAt.getTime() - Date.now()).toBeGreaterThan(13.9 * 24 * 60 * 60 * 1000);
  });

  it("shows the story without using up the link, and never shows an email address", async () => {
    const token = await submitAmara();
    const result = await parentView(token);
    expect(result).toMatchObject({
      ok: true,
      view: { firstName: "Amara", headline: "Calming a nervous dog", card: { name: "Amara", trust: "community" }, decided: null },
    });
    expect(JSON.stringify(result)).not.toContain("@");
    expect((await db.token.findFirstOrThrow({ where: { purpose: "parent_decision" } })).usedAt).toBeNull();
  });

  it("approval before the young person confirms waits for them, then goes to review", async () => {
    const token = await submitAmara();
    expect(await decideAsParent(token, "approve")).toEqual({ ok: true, decided: "approved", already: false });
    expect(await status()).toBe("awaiting_email");
    await confirmStoryEmail(tokenIn(lastEmail("confirm_email").text, "confirm"));
    expect(await status()).toBe("in_review");
  });

  it("approval after the young person confirms moves the story to review", async () => {
    const token = await submitAmara();
    await confirmStoryEmail(tokenIn(lastEmail("confirm_email").text, "confirm"));
    expect(await status()).toBe("awaiting_parent");
    await decideAsParent(token, "approve");
    expect(await status()).toBe("in_review");
    expect(await db.auditEvent.count({ where: { action: "parent_approved", actorType: "parent" } })).toBe(1);
  });

  it("approve without name shows the story as Anonymous", async () => {
    const token = await submitAmara();
    expect(await decideAsParent(token, "approve_anonymous")).toMatchObject({ decided: "approved_anonymous" });
    expect(await db.story.findFirstOrThrow()).toMatchObject({ displayChoice: "anon" });
    expect(await parentView(token)).toMatchObject({ view: { card: { name: "Anonymous" }, decided: "approved_anonymous" } });
  });

  it("decline rejects the story and schedules media deletion; a second answer is ignored", async () => {
    const token = await submitAmara();
    const story = await db.story.findFirstOrThrow();
    await db.media.create({ data: { storyId: story.id, kind: "voice", storageKey: "k", originalName: "voice-note", sizeBytes: 1n } });
    expect(await decideAsParent(token, "decline")).toMatchObject({ decided: "declined" });
    expect(await status()).toBe("rejected");
    expect((await db.media.findFirstOrThrow()).deleteAfter).not.toBeNull();
    expect(await decideAsParent(token, "approve")).toEqual({ ok: true, decided: "declined", already: true });
    expect(await status()).toBe("rejected");
    expect((await db.auditEvent.findFirstOrThrow({ where: { action: "parent_declined" } })).payload).toMatchObject({ reason: "Parent declined" });
  });

  it("refuses unknown and expired links", async () => {
    const token = await submitAmara();
    expect(await parentView("nope")).toEqual({ ok: false, reason: "not_found" });
    expect(await decideAsParent("nope", "approve")).toEqual({ ok: false, reason: "not_found" });
    await db.token.updateMany({ where: { purpose: "parent_decision" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await parentView(token)).toEqual({ ok: false, reason: "expired" });
    expect(await decideAsParent(token, "approve")).toEqual({ ok: false, reason: "expired" });
  });

  it("adults need no parent", async () => {
    await submitStory(DEVICE, submission({ ...amara, age: "18 to 24", parentEmail: "" }));
    expect(await db.token.count({ where: { purpose: "parent_decision" } })).toBe(0);
  });

  it("doesn't email the parent of a story held for safeguarding (build plan M5.6)", async () => {
    const { storyId } = (await saveDraft(DEVICE, pickDraftAnswers(amara))) as { storyId: string };
    await db.flag.create({ data: { storyId, type: "safeguarding", source: "ai", detail: "Raised in the interview" } });
    await submitStory(DEVICE, submission(amara));
    expect(await status()).toBe("safeguarding_review");
    expect(await db.token.count({ where: { purpose: "parent_decision" } })).toBe(0);
  });
});
