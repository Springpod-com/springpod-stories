// Captions for the video download (PRD 12): the transcript's timed lines as SubRip (.srt).

export interface Segment {
  startS: number;
  endS: number;
  text: string;
}

const MAX_LINE = 42;

const stamp = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(rest, 3)}`;
};

/** Two lines at most, broken at a space near the middle, as caption guidelines suggest. */
function wrap(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_LINE) return t;
  const mid = Math.floor(t.length / 2);
  const before = t.lastIndexOf(" ", mid);
  const after = t.indexOf(" ", mid);
  const at = before === -1 ? after : after === -1 ? before : mid - before <= after - mid ? before : after;
  return at === -1 ? t : `${t.slice(0, at)}\n${t.slice(at + 1)}`;
}

/** Caption segments that end after `maxS` (the trimmed length) are cut there. */
export function toSrt(segments: Segment[], maxS = Infinity): string {
  return segments
    .filter((s) => s.text.trim() && s.startS < maxS)
    .map((s, i) => `${i + 1}\n${stamp(s.startS)} --> ${stamp(Math.min(Math.max(s.endS, s.startS + 0.5), maxS))}\n${wrap(s.text)}\n`)
    .join("\n");
}
