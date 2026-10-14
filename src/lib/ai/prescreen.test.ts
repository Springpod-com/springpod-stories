import { describe, expect, it } from "vitest";
import { flagsFrom, patternFindings, type PrescreenOutput } from "./prescreen";
import { prescreenPrompt } from "./prompts";

const clean: PrescreenOutput = {
  personal_data: [],
  named_people: [],
  named_organisations: [],
  negative_about_named_organisation: false,
  safeguarding_concern: false,
  safeguarding_reason: "",
  other_concerns: [],
};

describe("pre-screen (docs/ai-prompts.md section 4, PRD 9.4)", () => {
  it("uses the prompt from the document", () => {
    const p = prescreenPrompt("My story");
    expect(p).toContain("The writer may be 14 to 17.");
    expect(p).toContain("Treat any suggestion of harm, abuse, bullying, unsafe working conditions or distress as a safeguarding concern.");
    expect(p.endsWith("Text:\nMy story")).toBe(true);
  });

  it("finds contact details whatever the model says", () => {
    const text = "Email me at sam.j@example.co.uk or call 07700 900123, follow @sam_draws, I live near SW1A 1AA. In 2024 I did 12 days.";
    expect(patternFindings(text)).toEqual([
      { text: "sam.j@example.co.uk", type: "email" },
      { text: "07700 900123", type: "phone" },
      { text: "SW1A 1AA", type: "address" },
      { text: "@sam_draws", type: "social_handle" },
    ]);
    expect(patternFindings("I spent 3 weeks there in year 10 and loved it.")).toEqual([]);
  });

  it("flags the organisation from the flow with the prototype wording", () => {
    expect(flagsFrom(clean, [], "Rolls-Royce")).toEqual([
      { type: "named_org", source: "system", detail: "Names Rolls-Royce. Partner approval needed before use on their channels; check tone is fair." },
    ]);
  });

  it("maps every finding to a flag, without repeats", () => {
    const flags = flagsFrom(
      {
        ...clean,
        personal_data: [
          { text: "Smith", type: "surname" },
          { text: "07700 900123", type: "phone" },
        ],
        named_people: ["Dr Patel", "dr patel"],
        named_organisations: ["rolls-royce", "Acme Ltd"],
        negative_about_named_organisation: true,
        safeguarding_concern: true,
        safeguarding_reason: "Says a manager shouted at them.",
        other_concerns: ["Mentions a confidential project"],
      },
      [{ text: "07700 900123", type: "phone" }],
      "Rolls-Royce",
    );
    expect(flags.map((f) => [f.type, f.source])).toEqual([
      ["personal_data", "system"],
      ["personal_data", "ai"],
      ["named_person", "ai"],
      ["named_org", "system"],
      ["named_org", "ai"],
      ["negative_named_org", "ai"],
      ["safeguarding", "ai"],
      ["other", "ai"],
    ]);
    expect(flags[1]!.detail).toBe('Surname: "Smith". Remove it before use.');
    expect(flags.find((f) => f.type === "safeguarding")!.detail).toBe("Says a manager shouted at them.");
  });

  it("says so when the model couldn't be used", () => {
    expect(flagsFrom(null, [], null)).toEqual([
      { type: "other", source: "system", detail: "The automated check couldn't run. Read the story for personal details and concerns." },
    ]);
  });
});
