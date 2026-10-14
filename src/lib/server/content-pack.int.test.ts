import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import type { ContentPackGenerate } from "@/lib/ai/content-pack";
import type { Staff } from "@/lib/staff";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { contentPackView, generateContentPack } from "./content-pack";
import { db } from "./db";
import type { SendJob } from "./jobs";
import { cardDownload, markPublished, removeStory, removeView } from "./publishing";
import { retentionSweep } from "./retention";
import { approve } from "./review";
import { confirmStoryEmail, saveDraft, submitStory } from "./stories";
import { objectSize, putObject } from "./storage";

const DEVICE = "device-pack";
const content: Staff = { id: "staff-c", email: "c@springpod.com", name: "Cara", role: "content" };
const moderator: Staff = { id: "staff-m", email: "m@springpod.com", name: "Mo", role: "moderator" };

const base: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Josh",
  expType: "Internship",
  role: "Engineering",
  org: "Rolls-Royce",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written: Array.from({ length: 45 }, () => "word").join(" "),
  draft: { headline: "The engine problem", story: "We worked out why a part kept cracking.\n\nIt taught me a lot.", pullQuote: "Getting it right felt great.", quoteOptions: ["Getting it right felt great."], skills: ["Problem solving"], advice: "", sector: "Aerospace" },
  display: "first",
  channels: { platform: false, website: false, blog: true, social: false },
  email: "josh@example.com",
  terms: true,
};

const submission = (s: FlowState): Submission => ({ ...pickDraftAnswers(s), channels: s.channels, email: s.email, parentEmail: s.parentEmail, terms: s.terms, marketing: s.marketing });

function emails(template: string) {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  return readdirSync(dir)
    .filter((f) => f.endsWith(`${template}.json`))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { to: string; text: string });
}
const linkIn = (text: string, path: string) => new RegExp(`/${path}/([\\w-]+)`).exec(text)![1]!;

async function inReview(s: FlowState = base) {
  const r = await submitStory(DEVICE, submission(s));
  if (!r.ok) throw new Error("not submitted");
  await confirmStoryEmail(linkIn(emails("confirm_email").at(-1)!.text, "confirm"));
  return r.storyId;
}

const pack = {
  linkedin: "LinkedIn text.",
  instagram: "Instagram text.",
  video: "Hook\n1. Shot\n2. Shot\n3. Shot\n4. Shot",
  blogTitle: "Blog title",
  blogIntro: "Blog intro.",
  snippet: "Snippet.",
  tags: ["Engineering", "#Aerospace", "internship", "problem solving", "careers"],
};

describe("content pack (PRD 12)", () => {
  it("only makes and shows assets for the channels the person agreed to (acceptance criterion 10)", async () => {
    const id = await inReview();
    const generate = vi.fn<ContentPackGenerate>(async () => pack);
    const send = vi.fn<SendJob>(async () => undefined);
    expect(await generateContentPack(content, id, generate, send)).toEqual({ ok: true, fallback: false });
    expect(generate.mock.calls[0]![0]).toContain('Refer to the person only as "Josh". The organisation is Rolls-Royce; mention it factually. Label it as a community story');
    expect(send).toHaveBeenCalledWith("quote-card-render", { storyId: id });
    expect((await db.asset.findMany()).map((a) => a.kind).sort()).toEqual(["blog", "tags"]);
    const view = await contentPackView(id);
    expect(Object.keys(view!.latest).sort()).toEqual(["blog", "tags"]);
    expect(view!.latest.blog!.content).toBe("Blog title\n\nBlog intro.");
    expect(view!.latest.tags!.content).toBe("engineering\naerospace\ninternship\nproblem solving\ncareers");
  });

  it("keeps earlier versions when regenerated, and is for the content team only", async () => {
    const id = await inReview({ ...base, channels: { platform: true, website: false, blog: false, social: true } });
    expect(await generateContentPack(moderator, id, async () => pack, vi.fn())).toEqual({ ok: false, problem: "Only the content team can make content packs." });
    await generateContentPack(content, id, async () => pack, vi.fn());
    await generateContentPack(content, id, async () => ({ ...pack, linkedin: "Second version." }), vi.fn());
    const view = await contentPackView(id);
    expect(Object.keys(view!.latest).sort()).toEqual(["instagram", "linkedin", "snippet", "tags", "video_hook"]);
    expect(view!.latest.linkedin!.content).toBe("Second version.");
    expect(view!.history.find((a) => a.kind === "linkedin")!.content).toBe("LinkedIn text.");
  });

  it("falls back to the story's own words without the model", async () => {
    const id = await inReview({ ...base, channels: { platform: false, website: false, blog: false, social: true } });
    expect(await generateContentPack(content, id, null, vi.fn())).toEqual({ ok: true, fallback: true });
    const view = await contentPackView(id);
    expect(view!.latest.instagram!.content).toBe("Getting it right felt great.");
    expect(view!.latest.video_hook).toBeUndefined();
  });

  it("isn't made for stories that aren't in review or approved", async () => {
    await saveDraft(DEVICE, pickDraftAnswers(base));
    const draft = await db.story.findFirstOrThrow();
    expect(await generateContentPack(content, draft.id, async () => pack, vi.fn())).toMatchObject({ ok: false });
  });
});

describe("emails and withdrawal (PRD 14, 9.3, acceptance criterion 12)", () => {
  it("every email to the person has a working remove link", async () => {
    const id = await inReview();
    await approve(moderator, id);
    const [confirm, approved] = [emails("confirm_email").at(-1)!, emails("approved").at(-1)!];
    expect(approved.text).toContain("Where it may appear: On our blog");
    for (const e of [confirm, approved]) expect(e.text).toMatch(/Remove my story: .*\/remove\/[\w-]+/);
    expect((await db.story.findUniqueOrThrow({ where: { id } })).approvedAt).not.toBeNull();
  });

  it("publishing emails the link and the quote card; the card link stops working once removed", async () => {
    const id = await inReview();
    expect(await markPublished(content, id, "https://springpod.com/stories/x")).toEqual({ ok: false, problem: "Only approved stories can be published." });
    await approve(moderator, id);
    await putObject(`assets/${id}/card.png`, Buffer.from("png"), "image/png");
    await db.asset.create({ data: { storyId: id, kind: "quote_card_4x5", storageKey: `assets/${id}/card.png`, createdBy: "system" } });
    expect(await markPublished(content, id, "not a link")).toMatchObject({ ok: false });
    expect(await markPublished(content, id, "https://springpod.com/stories/x")).toEqual({ ok: true });

    const published = emails("published").at(-1)!;
    expect(published.text).toContain("Share it: https://springpod.com/stories/x");
    const sig = /\/api\/card\/[\w-]+\?sig=([\w-]+)/.exec(published.text)![1]!;
    expect(await cardDownload(id, sig)).toContain("X-Amz-Signature");
    expect(await cardDownload(id, "wrong")).toBeNull();

    const remove = linkIn(published.text, "remove");
    expect(await removeView(remove)).toEqual({ ok: true, headline: "The engine problem", removed: false });
    expect(await removeStory(remove)).toEqual({ ok: true, already: false });
    expect(await removeStory(remove)).toEqual({ ok: true, already: true });
    expect(await db.story.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "withdrawn" });
    expect(await db.asset.count({ where: { withdrawnAt: null } })).toBe(0);
    expect(await cardDownload(id, sig)).toBeNull();
  });

  it("withdrawn media is deleted by the retention sweep after 30 days", async () => {
    const id = await inReview({ ...base, format: "write" });
    const key = `media/${id}/m1/original`;
    await putObject(key, Buffer.from("video"), "video/mp4");
    const media = await db.media.create({ data: { id: "m1", storyId: id, kind: "video", storageKey: key, originalName: "video", sizeBytes: 5n, status: "ready" } });
    await removeStory(linkIn(emails("confirm_email").at(-1)!.text, "remove"));

    expect(JSON.parse(await retentionSweep())).toMatchObject({ media: 0 });
    expect(await objectSize(key)).toBe(5);
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(JSON.parse(await retentionSweep(later))).toMatchObject({ media: 1 });
    expect(await objectSize(key)).toBeNull();
    expect(await db.media.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ status: "deleted" });
  });

  it("deletes drafts that were never sent, and old expired links", async () => {
    await saveDraft("old-device", pickDraftAnswers(base));
    await db.story.updateMany({ data: { updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    await db.token.create({ data: { tokenHash: "x", purpose: "confirm_email", expiresAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    expect(JSON.parse(await retentionSweep())).toMatchObject({ drafts: 1, tokens: 1 });
    expect(await db.story.count()).toBe(0);
  });
});
