// The pre-screen (docs/ai-prompts.md section 4, PRD 9.4): the model's findings plus a pattern
// check that runs whatever the model says, turned into flags for the team. Pure: no database.

import { z } from "zod";

export const PERSONAL_DATA_TYPES = ["surname", "school", "address", "phone", "email", "social_handle", "other"] as const;

export const prescreenOutputSchema = z.object({
  personal_data: z.array(z.object({ text: z.string(), type: z.enum(PERSONAL_DATA_TYPES) })),
  named_people: z.array(z.string()),
  named_organisations: z.array(z.string()),
  negative_about_named_organisation: z.boolean(),
  safeguarding_concern: z.boolean(),
  safeguarding_reason: z.string(),
  other_concerns: z.array(z.string()),
});

export type PrescreenOutput = z.infer<typeof prescreenOutputSchema>;
export type PrescreenGenerate = (prompt: string) => Promise<unknown>;

export type FlagType = "personal_data" | "named_org" | "named_person" | "safeguarding" | "negative_named_org" | "other";
export interface FlagDraft {
  type: FlagType;
  detail: string;
  source: "ai" | "system";
}

/**
 * Contact details the model might miss (build plan C8): email addresses, UK phone numbers,
 * postcodes and social handles. Runs on every story, with or without the model.
 */
const PATTERNS: { type: (typeof PERSONAL_DATA_TYPES)[number]; re: RegExp }[] = [
  { type: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { type: "phone", re: /(?:\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b|\b0\d{2,4}\s?\d{3,4}\s?\d{3,4}\b/g },
  { type: "address", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g },
  { type: "social_handle", re: /(?<![\w.])@[A-Za-z0-9_.]{2,30}\b/g },
];

export function patternFindings(text: string): PrescreenOutput["personal_data"] {
  const found = new Map<string, (typeof PERSONAL_DATA_TYPES)[number]>();
  for (const { type, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = m[0].trim();
      // An email address also matches the handle pattern; keep the first, more specific, type.
      if (![...found.keys()].some((k) => k.includes(value))) found.set(value, type);
    }
  }
  return [...found].map(([text, type]) => ({ text, type }));
}

const TYPE_LABEL: Record<(typeof PERSONAL_DATA_TYPES)[number], string> = {
  surname: "Surname",
  school: "School",
  address: "Address",
  phone: "Phone number",
  email: "Email address",
  social_handle: "Social media handle",
  other: "Personal detail",
};

const uniq = (items: string[]) => [...new Map(items.map((i) => [i.trim().toLowerCase(), i.trim()])).values()].filter(Boolean);

/**
 * Turns findings into flags. The organisation the person named in the flow always gets the
 * partner approval flag (wording from the prototype). `ai` is null when the model wasn't used.
 */
export function flagsFrom(ai: PrescreenOutput | null, patterns: PrescreenOutput["personal_data"], organisation: string | null): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const seen = new Set<string>();
  for (const [items, source] of [
    [patterns, "system"],
    [ai?.personal_data ?? [], "ai"],
  ] as const) {
    for (const p of items) {
      const key = p.text.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      flags.push({ type: "personal_data", source, detail: `${TYPE_LABEL[p.type]}: "${p.text.trim()}". Remove it before use.` });
    }
  }
  for (const person of uniq(ai?.named_people ?? [])) {
    flags.push({ type: "named_person", source: "ai", detail: `Names ${person}. Check they are happy to be named, or remove the name.` });
  }
  const orgs = uniq([...(organisation?.trim() ? [organisation] : []), ...(ai?.named_organisations ?? [])]);
  for (const org of orgs) {
    const fromFlow = organisation?.trim().toLowerCase() === org.toLowerCase();
    flags.push({
      type: "named_org",
      source: fromFlow ? "system" : "ai",
      detail: `Names ${org}. Partner approval needed before use on their channels; check tone is fair.`,
    });
  }
  if (ai?.negative_about_named_organisation) {
    flags.push({
      type: "negative_named_org",
      source: "ai",
      detail: "Says something negative about a named organisation. Anonymise it or keep it off brand channels.",
    });
  }
  if (ai?.safeguarding_concern) {
    flags.push({ type: "safeguarding", source: "ai", detail: ai.safeguarding_reason.trim() || "Possible safeguarding concern." });
  }
  for (const concern of uniq(ai?.other_concerns ?? [])) flags.push({ type: "other", source: "ai", detail: concern });
  if (!ai) {
    // COPY GAP G12: placeholder wording.
    flags.push({ type: "other", source: "system", detail: "The automated check couldn't run. Read the story for personal details and concerns." });
  }
  return flags;
}
