// Story drafts (docs/ai-prompts.md section 2, PRD 8). The model's JSON is checked against a schema
// and tidied to the limits the screens and the database use; anything unusable means the fallback.

import { z } from "zod";
import type { Draft } from "@/flow/state";
import { pickQuotes } from "./fallbacks";

/** The JSON the prompt asks for. Lengths are checked after parsing, in `normaliseDraft`. */
export const draftOutputSchema = z.object({
  headline: z.string(),
  story: z.string(),
  quoteOptions: z.array(z.string()),
  pullQuote: z.string(),
  skills: z.array(z.string()),
  advice: z.string(),
  sector: z.string(),
});

/** Card quotes are at most 160 characters (PRD 8: "max 160 characters"). */
export const MAX_QUOTE_CHARS = 160;
const LIMITS = { headline: 160, story: 6000, skill: 60, skills: 4, advice: 300, sector: 120 };
const MIN_STORY_WORDS = 40;

/** Takes a prompt and returns the model's parsed JSON, or throws. Swapped for a fake in tests. */
export type DraftGenerate = (prompt: string) => Promise<unknown>;

const EM_DASH = String.fromCodePoint(0x2014);

/** Plain text in our house style: no em dashes (CLAUDE.md), single spaces. */
function tidy(text: string, max: number): string {
  const clean = text
    .replaceAll(` ${EM_DASH} `, ", ")
    .replaceAll(EM_DASH, ", ")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.8))).trim();
}

const tidyStory = (text: string) =>
  tidy(
    text
      .split(/\n\s*\n/)
      .map((p) => tidy(p, LIMITS.story))
      .filter(Boolean)
      .join("\n\n"),
    LIMITS.story,
  );

const unquote = (q: string) => q.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

/**
 * Checks and tidies a model reply. Returns null when it isn't usable (wrong shape, or too
 * little story to show), so the caller can fall back.
 */
export function normaliseDraft(raw: unknown, sectorFallback: string): Draft | null {
  const parsed = draftOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const story = tidyStory(d.story);
  if ((story.match(/\S+/g) ?? []).length < MIN_STORY_WORDS || !d.headline.trim()) return null;

  const quoteOptions = [...new Set(d.quoteOptions.map((q) => tidy(unquote(q), MAX_QUOTE_CHARS)).filter(Boolean))].slice(0, 3);
  if (!quoteOptions.length) return null;
  const pull = tidy(unquote(d.pullQuote), MAX_QUOTE_CHARS);
  return {
    headline: tidy(d.headline, LIMITS.headline),
    story,
    quoteOptions,
    // The pull quote should be one of the options; if not, the first option is used.
    pullQuote: quoteOptions.includes(pull) ? pull : quoteOptions[0]!,
    skills: [...new Set(d.skills.map((s) => tidy(s, LIMITS.skill)).filter(Boolean))].slice(0, LIMITS.skills),
    advice: tidy(d.advice, LIMITS.advice),
    sector: tidy(d.sector, LIMITS.sector) || sectorFallback,
  };
}

/**
 * When drafting fails (docs/ai-prompts.md section 2): the story is the person's own words and the
 * quotes come from `pickQuotes`. Quotes are trimmed to fit the card.
 */
export function draftFallback(ownWords: string, expType: string, role: string): Draft {
  const quoteOptions = pickQuotes(ownWords).map((q) => tidy(q, MAX_QUOTE_CHARS));
  return {
    headline: `My ${expType.toLowerCase()} in ${role || "a new team"}`,
    story: tidyStory(ownWords),
    pullQuote: quoteOptions[0] ?? "",
    quoteOptions,
    skills: ["Communication", "Confidence"],
    advice: "Say yes to things and ask questions.",
    sector: role,
  };
}
