import { describe, expect, it } from "vitest";
import { parseAwsTranscript } from "./parse-aws";

const word = (content: string, start: number, end: number, confidence = "0.9") => ({
  type: "pronunciation" as const,
  start_time: String(start),
  end_time: String(end),
  alternatives: [{ confidence, content }],
});
const punct = (content: string) => ({ type: "punctuation" as const, alternatives: [{ confidence: "0.0", content }] });

describe("Amazon Transcribe output", () => {
  it("reads the text, averages word confidence and splits timed lines at sentence ends", () => {
    const out = parseAwsTranscript({
      results: {
        transcripts: [{ transcript: "I loved it. Would I go back? Yes." }],
        items: [
          word("I", 0, 0.2, "1.0"),
          word("loved", 0.2, 0.6, "0.8"),
          word("it", 0.6, 0.8, "0.9"),
          punct("."),
          word("Would", 1.2, 1.4),
          word("I", 1.4, 1.5),
          word("go", 1.5, 1.7),
          word("back", 1.7, 2.0),
          punct("?"),
          word("Yes", 2.4, 2.7),
          punct("."),
        ],
      },
    });
    expect(out.text).toBe("I loved it. Would I go back? Yes.");
    expect(out.confidence).toBe(0.9);
    expect(out.segments).toEqual([
      { startS: 0, endS: 0.8, text: "I loved it." },
      { startS: 1.2, endS: 2, text: "Would I go back?" },
      { startS: 2.4, endS: 2.7, text: "Yes." },
    ]);
  });

  it("breaks a long sentence so captions stay short", () => {
    const items = Array.from({ length: 20 }, (_, i) => word(`w${i}`, i, i + 0.5));
    const out = parseAwsTranscript({ results: { transcripts: [{ transcript: "" }], items } });
    expect(out.segments.length).toBeGreaterThan(1);
    expect(out.segments.every((s) => s.endS - s.startS <= 7.5)).toBe(true);
  });

  it("copes with an empty result", () => {
    expect(parseAwsTranscript({})).toEqual({ text: "", confidence: null, segments: [] });
  });
});
