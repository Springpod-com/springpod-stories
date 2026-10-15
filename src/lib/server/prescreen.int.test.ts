import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState, type FlowState } from "@/flow/state";
import type { PrescreenGenerate, PrescreenOutput } from "@/lib/ai/prescreen";
import { pickDraftAnswers, type Submission } from "@/lib/story-data";
import { db, lockStory } from "./db";
import { runPrescreen } from "./prescreen";
import { confirmStoryEmail, submitStory } from "./stories";

const DEVICE = "device-prescreen";

const story: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Josh",
  expType: "Springpod virtual programme",
  role: "Aerospace engineering",
  org: "Rolls-Royce",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written:
    "The task that hooked me was a failure investigation. We had to work out why a component kept cracking, using real data. " +
    "My team got it wrong first time, which taught me more than getting it right. Call me on 07700 900123 if you want to know more.",
  draft: { headline: "The engine problem", story: "We had to work out why a component kept cracking.", pullQuote: "Getting it right felt great.", quoteOptions: ["Getting it right felt great."], skills: [], advice: "", sector: "" },
  display: "first",
  channels: { platform: true, website: false, blog: false, social: false },
  email: "josh@example.com",
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

const clean: PrescreenOutput = {
  personal_data: [],
  named_people: [],
  named_organisations: [],
  negative_about_named_organisation: false,
  safeguarding_concern: false,
  safeguarding_reason: "",
  other_concerns: [],
};

/** Submits without running the job, so each test runs the pre-screen with its own fake model. */
async function submitted(s: FlowState = story) {
  const result = await submitStory(DEVICE, submission(s), async () => undefined);
  if (!result.ok) throw new Error("not submitted");
  return result.storyId;
}

const outbox = (template: string) => readdirSync(process.env.EMAIL_OUTBOX_DIR!).filter((f) => f.endsWith(`${template}.json`)).length;
const current = () => db.story.findFirstOrThrow();

afterEach(() => {
  delete process.env.SAFEGUARDING_LEAD_EMAIL;
});

describe("pre-screen (PRD 9.4)", () => {
  it("waits in submitted until the pre-screen runs, then waits for the email", async () => {
    const id = await submitted();
    expect((await current()).status).toBe("submitted");
    const generate = vi.fn<PrescreenGenerate>(async () => clean);
    expect(await runPrescreen(id, generate)).toBe("awaiting_email");
    const prompt = generate.mock.calls[0]![0];
    expect(prompt).toContain("Headline:\nThe engine problem");
    expect(prompt).toContain("Organisation:\nRolls-Royce");
  });

  it("flags the organisation and contact details even when the model finds nothing", async () => {
    const id = await submitted({ ...story, draft: { ...story.draft!, story: "Ring 07700 900123." } });
    await runPrescreen(id, async () => clean);
    const flags = await db.flag.findMany({ orderBy: { createdAt: "asc" } });
    expect(flags.map((f) => [f.type, f.source])).toEqual(
      expect.arrayContaining([
        ["personal_data", "system"],
        ["named_org", "system"],
      ]),
    );
    expect(flags.find((f) => f.type === "named_org")!.detail).toBe(
      "Names Rolls-Royce. Partner approval needed before use on their channels; check tone is fair.",
    );
  });

  it("holds a safeguarding concern and tells the safeguarding lead once, with no story content", async () => {
    process.env.SAFEGUARDING_LEAD_EMAIL = "lead@springpod.example";
    const before = outbox("safeguarding_flag");
    const id = await submitted();
    const concern = async () => ({ ...clean, safeguarding_concern: true, safeguarding_reason: "Describes being shouted at." });
    expect(await runPrescreen(id, concern)).toBe("safeguarding_review");
    expect(await runPrescreen(id, concern)).toBe("safeguarding_review");
    expect(outbox("safeguarding_flag")).toBe(before + 1);
    expect(await db.flag.count({ where: { type: "safeguarding" } })).toBe(1);
  });

  it("records a missing safeguarding lead for the admin warning", async () => {
    const id = await submitted();
    await runPrescreen(id, async () => ({ ...clean, safeguarding_concern: true, safeguarding_reason: "x" }));
    expect(await db.auditEvent.count({ where: { action: "safeguarding_lead_missing" } })).toBe(1);
  });

  it("moves straight to review if the email was confirmed while it ran", async () => {
    const id = await submitted();
    const dir = process.env.EMAIL_OUTBOX_DIR!;
    const file = readdirSync(dir).filter((f) => f.endsWith("confirm_email.json")).sort().pop()!;
    const { text } = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(`${dir}/${file}`, "utf8"))) as { text: string };
    await confirmStoryEmail(/\/confirm\/([\w-]+)/.exec(text)![1]!);
    expect((await current()).status).toBe("submitted");
    expect(await runPrescreen(id, async () => clean)).toBe("in_review");
  });

  // The email confirmation and the pre-screen both move a submitted story on. Each locks the story,
  // so whichever goes second sees what the first did and the story never strands in awaiting_email.
  const confirmToken = async () => {
    const dir = process.env.EMAIL_OUTBOX_DIR!;
    const file = readdirSync(dir).filter((f) => f.endsWith("confirm_email.json")).sort().pop()!;
    const { text } = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(`${dir}/${file}`, "utf8"))) as { text: string };
    return /\/confirm\/([\w-]+)/.exec(text)![1]!;
  };

  it("an email confirmed while the pre-screen is saving waits for it, then moves the story on", async () => {
    const id = await submitted();
    const token = await confirmToken();
    let confirming: Promise<unknown> = Promise.resolve();
    await db.$transaction(async (tx) => {
      // As the pre-screen does: lock, read, then save "awaiting_email".
      await lockStory(tx, id);
      confirming = confirmStoryEmail(token);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.story.update({ where: { id }, data: { status: "awaiting_email" } });
    });
    await confirming;
    expect((await db.story.findUniqueOrThrow({ where: { id } })).status).toBe("in_review");
  });

  it("a pre-screen that runs while the email is being confirmed waits for it, then moves straight to review", async () => {
    const id = await submitted();
    let screening: Promise<string> = Promise.resolve("");
    await db.$transaction(async (tx) => {
      // As the confirmation does: lock, then record the confirmed email.
      await lockStory(tx, id);
      screening = runPrescreen(id, async () => clean);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const story = await tx.story.findUniqueOrThrow({ where: { id } });
      await tx.submitter.update({ where: { id: story.submitterId! }, data: { emailConfirmedAt: new Date() } });
    });
    expect(await screening).toBe("in_review");
  });

  it("asks the parent or carer only once the story is cleared", async () => {
    const minor = { ...story, age: "14 to 17" as const, parentEmail: "parent@example.com" };
    const before = outbox("parent_consent");
    const held = await submitted(minor);
    await runPrescreen(held, async () => ({ ...clean, safeguarding_concern: true, safeguarding_reason: "x" }));
    expect(outbox("parent_consent")).toBe(before);

    await db.$executeRawUnsafe('TRUNCATE "Story", "Token", "Consent", "Submitter", "Flag", "AuditEvent" CASCADE');
    const cleared = await submitted(minor);
    await runPrescreen(cleared, async () => clean);
    expect(outbox("parent_consent")).toBe(before + 1);
  });

  it("notes when the model couldn't be used, and replaces old automated flags on a re-run", async () => {
    const id = await submitted();
    await runPrescreen(id, async () => {
      throw new Error("timeout");
    });
    expect(await db.flag.count({ where: { detail: { startsWith: "The automated check couldn't run" } } })).toBe(1);
    await db.flag.create({ data: { storyId: id, type: "other", source: "team", detail: "Team note" } });
    await runPrescreen(id, async () => clean);
    expect(await db.flag.count({ where: { detail: { startsWith: "The automated check couldn't run" } } })).toBe(0);
    expect(await db.flag.count({ where: { source: "team" } })).toBe(1);
  });

  it("runs from submit through the job queue", async () => {
    await submitStory(DEVICE, submission(story));
    expect(await db.auditEvent.count({ where: { action: "prescreen_done" } })).toBe(1);
    expect((await current()).status).toBe("awaiting_email");
  });
});
