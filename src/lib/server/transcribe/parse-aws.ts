import type { Segment, Transcript } from "./types";

interface AwsItem {
  type: "pronunciation" | "punctuation";
  start_time?: string;
  end_time?: string;
  alternatives: { confidence?: string; content: string }[];
}

interface AwsOutput {
  results?: {
    transcripts?: { transcript: string }[];
    items?: AwsItem[];
  };
}

const MAX_SEGMENT_S = 7;

/** Amazon Transcribe's output JSON as text, average confidence and timed lines (sentences, split if long). */
export function parseAwsTranscript(json: AwsOutput): Transcript {
  const items = json.results?.items ?? [];
  const text = (json.results?.transcripts ?? []).map((t) => t.transcript).join(" ").trim();
  const confidences = items
    .filter((i) => i.type === "pronunciation")
    .map((i) => Number(i.alternatives[0]?.confidence))
    .filter((n) => Number.isFinite(n));

  const segments: Segment[] = [];
  let words: string[] = [];
  let start: number | null = null;
  let end = 0;
  const flush = () => {
    if (words.length && start !== null) segments.push({ startS: start, endS: end, text: words.join(" ") });
    words = [];
    start = null;
  };
  for (const item of items) {
    const content = item.alternatives[0]?.content ?? "";
    if (item.type === "punctuation") {
      if (words.length) words[words.length - 1] += content;
      if (/[.?!]/.test(content)) flush();
      continue;
    }
    const s = Number(item.start_time);
    const e = Number(item.end_time);
    if (start !== null && s - start > MAX_SEGMENT_S) flush();
    start ??= s;
    end = e;
    words.push(content);
  }
  flush();

  return {
    text,
    confidence: confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000 : null,
    segments,
  };
}
