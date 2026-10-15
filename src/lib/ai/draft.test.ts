import { describe, expect, it } from "vitest";
import { draftFallback, MAX_QUOTE_CHARS, normaliseDraft } from "./draft";
import { draftPrompt } from "./prompts";

const EM_DASH = String.fromCodePoint(0x2014);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const reply = {
  headline: "The day a patient thanked me by name",
  story: `${words(30)}\n\n${words(30)}\n\n  \n\n${words(30)}`,
  quoteOptions: ["“I realised I could actually help people.”", "I was nervous but proud.", "I was nervous but proud."],
  pullQuote: "I was nervous but proud.",
  skills: ["Communication", "Teamwork", "Listening", "Patience", "Extra"],
  advice: "Ask questions.",
  sector: "Healthcare",
};

describe("story draft (PRD 8, docs/ai-prompts.md section 2)", () => {
  it("builds the prompt from the document, with a different angle when asked", () => {
    const ctx = { firstName: "Sam", ageBand: "18 to 24", expType: "Internship", organisation: "", area: "Children's ward", whoLabel: "Student", nowText: "At university" };
    const prompt = draftPrompt(ctx, "x".repeat(13_000));
    expect(prompt).toContain("About the person: Sam, 18 to 24, Student. Experience: Internship, Children's ward. What they do now: At university.");
    expect(prompt).toContain("180 to 280 words in 3 or 4 short paragraphs.\nReply with only JSON");
    expect(prompt).toContain('"story": string (paragraphs separated by \\n\\n)');
    expect(prompt.endsWith("x".repeat(12_000))).toBe(true);
    expect(prompt).not.toContain("x".repeat(12_001));
    expect(draftPrompt({ ...ctx, organisation: "St Mary's" }, "s", "Old headline")).toContain(
      "Experience: Internship at St Mary's, Children's ward.",
    );
    expect(draftPrompt(ctx, "s", "Old headline")).toContain(
      "3 or 4 short paragraphs. Take a noticeably different angle and opening from this previous version: Old headline\n",
    );
    expect(prompt).not.toContain(EM_DASH);
  });

  it("tidies a good reply: paragraphs, unique quotes without quote marks, four skills at most", () => {
    const d = normaliseDraft(reply, "Fallback sector")!;
    expect(d.story.split("\n\n")).toHaveLength(3);
    expect(d.quoteOptions).toEqual(["I realised I could actually help people.", "I was nervous but proud."]);
    expect(d.pullQuote).toBe("I was nervous but proud.");
    expect(d.skills).toEqual(["Communication", "Teamwork", "Listening", "Patience"]);
  });

  it("removes em dashes and keeps quotes within the card limit", () => {
    const d = normaliseDraft(
      { ...reply, story: `${words(50)} ${EM_DASH} end`, quoteOptions: [`Long ${EM_DASH} ${"a ".repeat(120)}`], pullQuote: "Not an option" },
      "",
    )!;
    expect(d.story).not.toContain(EM_DASH);
    expect(d.quoteOptions[0]!.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
    expect(d.pullQuote).toBe(d.quoteOptions[0]);
  });

  it("rejects replies it can't use, so the fallback takes over", () => {
    expect(normaliseDraft(null, "")).toBeNull();
    expect(normaliseDraft({ ...reply, skills: "Communication" }, "")).toBeNull();
    expect(normaliseDraft({ ...reply, story: "Too short." }, "")).toBeNull();
    expect(normaliseDraft({ ...reply, quoteOptions: [" "] }, "")).toBeNull();
  });

  it("falls back to the person's own words with picked quotes", () => {
    const own = "I did my work experience at a hospital in year 10. The best moment was when a patient thanked me by name and I felt proud.";
    const d = draftFallback(own, "Internship", "Children's ward");
    expect(d.headline).toBe("My internship in Children's ward");
    expect(d.story).toBe(own);
    expect(d.pullQuote).toBe("The best moment was when a patient thanked me by name and I felt proud.");
  });
});
