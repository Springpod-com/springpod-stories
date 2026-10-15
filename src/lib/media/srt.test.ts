import { describe, expect, it } from "vitest";
import { toSrt } from "./srt";

describe("SRT captions (PRD 12)", () => {
  it("numbers the lines, formats the times and wraps long lines in two", () => {
    expect(
      toSrt([
        { startS: 0, endS: 2.5, text: "I loved it." },
        { startS: 3661.2, endS: 3665, text: "The moment that stuck with me was seeing how calm everyone stayed." },
      ]),
    ).toBe(
      "1\n00:00:00,000 --> 00:00:02,500\nI loved it.\n\n2\n01:01:01,200 --> 01:01:05,000\nThe moment that stuck with me was\nseeing how calm everyone stayed.\n",
    );
  });

  it("drops empty lines and stops at the trimmed length", () => {
    const srt = toSrt(
      [
        { startS: 0, endS: 1, text: " " },
        { startS: 88, endS: 92, text: "Last bit." },
        { startS: 95, endS: 96, text: "Cut." },
      ],
      90,
    );
    expect(srt).toBe("1\n00:01:28,000 --> 00:01:30,000\nLast bit.\n");
  });
});
