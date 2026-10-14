import { describe, expect, it } from "vitest";
import { cardLines, displayName, previewTrust, TRUST_LABEL_TEXT } from "./display";
import { initialState, type FlowState } from "./state";
import { pickQuotes } from "@/lib/ai/fallbacks";

const priya: FlowState = {
  ...initialState,
  who: "student",
  firstName: "priya sharma",
  expType: "Internship",
  role: "Marketing",
  nowStatus: "working",
  nowRole: "Junior Content Producer",
  nowCo: "Northern Media Co",
};

describe("display name", () => {
  it("uses the first word of the first name only", () => {
    expect(displayName({ ...priya, display: "first" })).toBe("priya");
    expect(displayName({ ...priya, display: "initial" })).toBe("P.");
    expect(displayName({ ...priya, display: "anon" })).toBe("Anonymous");
  });
});

describe("quote card lines", () => {
  it("shows the company only when allowed", () => {
    expect(cardLines({ ...priya, showCo: true })).toEqual({
      then: "Marketing work experience",
      now: "Junior Content Producer at Northern Media Co",
    });
    expect(cardLines({ ...priya, showCo: false }).now).toBe("Junior Content Producer");
  });

  it("describes what someone is doing now when not working", () => {
    expect(cardLines({ ...priya, nowStatus: "uni", nowRole: "" })).toEqual({
      then: "Internship · Marketing · now at university",
    });
  });
});

describe("trust labels", () => {
  it("uses the exact PRD wording", () => {
    expect(TRUST_LABEL_TEXT).toEqual({ verified: "Verified by Springpod", community: "Community story" });
    expect(previewTrust({ ...priya, who: "springpod" })).toBe("verified");
    expect(previewTrust(priya)).toBe("community");
  });
});

describe("pickQuotes", () => {
  it("prefers moments and feelings over what-and-when summaries", () => {
    const quotes = pickQuotes(
      "I did my work experience at a vet practice in year 10 last summer. " +
        "The moment I held the puppy I felt calm and proud of myself for once. " +
        "We had lunch at twelve every day in the staff room.",
    );
    expect(quotes[0]).toBe("The moment I held the puppy I felt calm and proud of myself for once.");
  });
});
