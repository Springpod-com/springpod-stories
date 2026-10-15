import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { queue, queueCounts, storyDetail, TEAM_CHECKS } from "./admin";
import { db } from "./db";
import { editView, resubmit } from "./edit";
import { decideAsParent } from "./parent";
import { approve, clearSafeguarding, reject, requestChanges, resendParent, setCheck, setTrust } from "./review";
import type { Staff } from "@/lib/staff";
import { confirmStoryEmail, saveDraft, submitStory } from "./stories";

const DEVICE = "device-review";
const staff: Staff = { id: "staff-1", email: "mo@springpod.com", name: "Mo", role: "moderator" };

const base: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Josh",
  expType: "Internship",
  role: "Engineering",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written: Array.from({ length: 45 }, () => "word").join(" "),
  draft: { headline: "The engine problem", story: "We worked out why a part kept cracking.", pullQuote: "Getting it right felt great.", quoteOptions: ["Getting it right felt great."], skills: ["Problem solving"], advice: "", sector: "" },
  display: "first",
  channels: { platform: true, website: true, blog: false, social: false },
  email: "josh@example.com",
  parentEmail: "",
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

function lastLink(template: string, path: string): string {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  const file = readdirSync(dir).filter((f) => f.endsWith(`${template}.json`)).sort().pop()!;
  const { text } = JSON.parse(readFileSync(join(dir, file), "utf8")) as { text: string };
  return new RegExp(`/${path}/([\\w-]+)`).exec(text)![1]!;
}

/** A sent and confirmed story, in review. */
async function inReview(s: FlowState = base) {
  const result = await submitStory(DEVICE, submission(s));
  if (!result.ok) throw new Error("not submitted");
  await confirmStoryEmail(lastLink("confirm_email", "confirm"));
  return result.storyId;
}

describe("team review (PRD 11.2)", () => {
  it("approves a written story in review", async () => {
    const id = await inReview();
    expect(await approve(staff, id)).toEqual({ ok: true, status: "approved" });
    expect(await db.review.findUniqueOrThrow({ where: { storyId: id } })).toMatchObject({ decision: "approved", decidedBy: "Mo" });
    expect(await db.auditEvent.count({ where: { action: "approved", actorId: "staff-1" } })).toBe(1);
  });

  it("won't approve while the parent or carer hasn't decided (acceptance criterion 3)", async () => {
    const id = await inReview({ ...base, age: "14 to 17", parentEmail: "parent@example.com" });
    expect((await db.story.findUniqueOrThrow({ where: { id } })).status).toBe("awaiting_parent");
    expect(await approve(staff, id)).toEqual({ ok: false, problem: "Waiting for the parent or carer to approve." });
    await decideAsParent(lastLink("parent_consent", "parent"), "approve");
    expect(await approve(staff, id)).toMatchObject({ ok: true });
  });

  it("won't approve a story with media until every team check is ticked, each saved with who and when", async () => {
    const id = await inReview();
    await db.media.create({ data: { storyId: id, kind: "voice", storageKey: "k", originalName: "voice-note", sizeBytes: 1n, status: "ready" } });
    expect(await approve(staff, id)).toEqual({ ok: false, problem: "Tick every voice note check first." });
    for (const c of TEAM_CHECKS.voice) await setCheck(staff, id, c.id, true);
    await setCheck(staff, id, "no_address", false);
    expect(await approve(staff, id)).toMatchObject({ ok: false });
    await setCheck(staff, id, "no_address", true);
    const detail = await storyDetail(id);
    expect(detail!.checklist.no_address).toMatchObject({ by: "Mo" });
    expect(await setCheck(staff, id, "not_a_check", true)).toEqual({ ok: false, problem: "invalid" });
    expect(await approve(staff, id)).toMatchObject({ ok: true });
  });

  it("holds a safeguarding story until cleared, then asks the parent", async () => {
    const minor = { ...base, age: "14 to 17" as const, parentEmail: "parent@example.com" };
    const { storyId } = (await saveDraft(DEVICE, pickDraftAnswers(minor))) as { storyId: string };
    await db.flag.create({ data: { storyId, type: "safeguarding", source: "ai", detail: "Raised in the interview" } });
    await submitStory(DEVICE, submission(minor));
    expect(await approve(staff, storyId)).toMatchObject({ ok: false, problem: "Waiting for the parent or carer to approve." });
    expect(await db.token.count({ where: { purpose: "parent_decision" } })).toBe(0);
    expect(await resendParent(staff, storyId)).toEqual({ ok: false, problem: "not_allowed" });

    expect(await clearSafeguarding(staff, storyId)).toEqual({ ok: true, status: "awaiting_email" });
    expect(await db.flag.findFirstOrThrow({ where: { type: "safeguarding" } })).toMatchObject({ resolvedBy: "Mo" });
    expect(await db.token.count({ where: { purpose: "parent_decision" } })).toBe(1);
  });

  it("resends the parent link, and the old one stops working (Q25)", async () => {
    const id = await inReview({ ...base, age: "14 to 17", parentEmail: "parent@example.com" });
    const first = lastLink("parent_consent", "parent");
    expect(await resendParent(staff, id)).toMatchObject({ ok: true });
    const second = lastLink("parent_consent", "parent");
    expect(second).not.toBe(first);
    expect(await decideAsParent(first, "approve")).toEqual({ ok: false, reason: "not_found" });
    expect(await decideAsParent(second, "approve")).toMatchObject({ ok: true });
  });

  it("requests changes with a message and an edit link; resubmitting goes back through the pre-screen to review", async () => {
    const id = await inReview();
    expect(await requestChanges(staff, id, " ")).toEqual({ ok: false, problem: "message_required" });
    expect(await requestChanges(staff, id, "Please take out the name of your manager.")).toEqual({ ok: true, status: "changes_requested" });
    const token = lastLink("changes_requested", "edit");
    expect(await editView(token)).toMatchObject({ ok: true, view: { message: "Please take out the name of your manager.", headline: "The engine problem" } });

    expect(await resubmit(token, { headline: "New headline", story: "Edited story.", pullQuote: "Edited quote." })).toEqual({ ok: true });
    expect(await db.story.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "in_review", headline: "New headline" });
    expect(await editView(token)).toEqual({ ok: false, reason: "done" });
    expect(await resubmit(token, { headline: "Again", story: "Again.", pullQuote: "Again." })).toEqual({ ok: false, reason: "done" });
  });

  it("rejects with a reason and schedules media deletion", async () => {
    const id = await inReview();
    await db.media.create({ data: { storyId: id, kind: "voice", storageKey: "k", originalName: "voice-note", sizeBytes: 1n } });
    expect(await reject(staff, id, "")).toEqual({ ok: false, problem: "reason_required" });
    expect(await reject(staff, id, "Not a work experience story")).toEqual({ ok: true, status: "rejected" });
    expect((await db.media.findFirstOrThrow()).deleteAfter).not.toBeNull();
    expect(await approve(staff, id)).toMatchObject({ ok: false });
  });

  it("lets the team verify a story by hand (PRD 10.3)", async () => {
    const id = await inReview();
    await setTrust(staff, id, "verified");
    expect((await storyDetail(id))!.trust).toBe("verified");
  });
});

describe("queue (PRD 11.1)", () => {
  it("lists sent stories with filters, search and counts, and never shows an email address", async () => {
    const a = await inReview();
    await approve(staff, a);
    await inReview({ ...base, format: "write", draft: { ...base.draft!, headline: "My Saturday job" } });
    await saveDraft("another-device", pickDraftAnswers(base));

    expect(await queueCounts()).toEqual({ toReview: 1, approved: 1, total: 2 });
    expect((await queue({})).map((s) => s.headline)).toHaveLength(2);
    expect((await queue({ status: "approved" })).map((s) => s.headline)).toEqual(["The engine problem"]);
    expect((await queue({ q: "saturday" })).map((s) => s.headline)).toEqual(["My Saturday job"]);
    expect(await queue({ channel: "social" })).toEqual([]);
    expect(await queue({ media: "yes" })).toEqual([]);
    expect(await queue({ safeguarding: "yes" })).toEqual([]);

    const detail = await storyDetail(a);
    expect(detail!.facts).toMatchObject({ nameShown: "Josh", age: "18 to 24", submittedAs: "Written", parentConsent: "Not needed" });
    expect(JSON.stringify([await queue({}), detail])).not.toMatch(/@example\.com/);
  });
});
