// Fallbacks used when an AI call fails (docs/ai-prompts.md section 2), ported from the prototype.

import type { Draft } from "@/flow/state";

const GOOD = /\b(best|moment|felt|feel|realised|realized|learn|learned|learnt|surprised|nervous|proud|scary|hardest|favourite|clicked|confidence|never|first time|actually)\b/i;
const BAD = /\b(year \d+|work experience (at|in|with)|i did (my|a|some)|my name is)\b/i;

/**
 * Picks up to three quote lines: sentences 35 to 150 characters long, rewarding
 * moments and feelings and penalising "what and when" summaries.
 */
export function pickQuotes(raw: string): string[] {
  const sentences = String(raw)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 35 && x.length <= 150);
  const scored = sentences.map((x) => ({
    x,
    score:
      (GOOD.test(x) ? 3 : 0) - (BAD.test(x) ? 3 : 0) + (/\b(i|me|my)\b/i.test(x) ? 1 : 0) - Math.abs(x.length - 90) / 60,
  }));
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, 3).map((o) => o.x);
  return out.length ? out : [String(raw).slice(0, 120)];
}

export function fallbackDraft(source: string, expType: string, role: string): Draft {
  const quoteOptions = pickQuotes(source);
  return {
    headline: `My ${expType.toLowerCase()} in ${role || "a new team"}`,
    story: source,
    pullQuote: quoteOptions[0] ?? "",
    quoteOptions,
    skills: ["Communication", "Confidence"],
    advice: "Say yes to things and ask questions.",
    sector: role,
  };
}
