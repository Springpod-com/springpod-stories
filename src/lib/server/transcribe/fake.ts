import type { Segment, Transcriber } from "./types";

/** Fixed sample text so the transcript screen can be built and tested without a provider. */
export const FAKE_TRANSCRIPT_LINES = [
  "On my first day I shadowed a nurse on the children's ward.",
  "I helped set up games in the playroom and talked to families while they waited.",
  "The moment that stuck with me was seeing how calm everyone stayed when it got busy.",
  "It made me sure I want to work in healthcare.",
];

export const fakeTranscriber: Transcriber = {
  name: "fake",
  async transcribe({ durationS }) {
    const each = Math.max(1, durationS) / FAKE_TRANSCRIPT_LINES.length;
    const segments: Segment[] = FAKE_TRANSCRIPT_LINES.map((text, i) => ({
      startS: Math.round(i * each * 100) / 100,
      endS: Math.round((i + 1) * each * 100) / 100,
      text,
    }));
    return { text: FAKE_TRANSCRIPT_LINES.join(" "), confidence: null, segments };
  },
};
