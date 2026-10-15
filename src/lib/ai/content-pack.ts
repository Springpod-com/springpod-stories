// The content pack (PRD 12, docs/ai-prompts.md section 3): which assets each channel gets, the
// model's JSON checked and tidied, and a fallback built only from the story's own words.

import { z } from "zod";

export const contentPackSchema = z.object({
  linkedin: z.string(),
  instagram: z.string(),
  video: z.string(),
  blogTitle: z.string(),
  blogIntro: z.string(),
  snippet: z.string(),
  tags: z.array(z.string()),
});
export type ContentPackOutput = z.infer<typeof contentPackSchema>;
export type ContentPackGenerate = (prompt: string) => Promise<unknown>;

export type Channel = "platform" | "website" | "blog" | "social";
export type TextAssetKind = "linkedin" | "instagram" | "video_hook" | "blog" | "snippet" | "tags";

/**
 * Text assets per channel the person agreed to (PRD 12, acceptance criterion 10). Social gets the
 * LinkedIn post, Instagram caption and video hook; the blog gets the title and intro; Springpod and
 * springpod.com get the programme page snippet. Tags are internal and always made (Q11).
 */
export function allowedAssets(channels: Channel[]): TextAssetKind[] {
  const kinds = new Set<TextAssetKind>(["tags"]);
  if (channels.includes("social")) ["linkedin", "instagram", "video_hook"].forEach((k) => kinds.add(k as TextAssetKind));
  if (channels.includes("blog")) kinds.add("blog");
  if (channels.includes("platform") || channels.includes("website")) kinds.add("snippet");
  return (["linkedin", "instagram", "video_hook", "blog", "snippet", "tags"] as const).filter((k) => kinds.has(k));
}

const EM_DASH = String.fromCodePoint(0x2014);
const tidy = (s: string) =>
  s
    .replaceAll(` ${EM_DASH} `, ", ")
    .replaceAll(EM_DASH, ", ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** The assets as stored: one string each (the blog is "title\n\nintro"; tags are one per line). */
export type ContentAssets = Partial<Record<TextAssetKind, string>>;

export function normaliseContentPack(raw: unknown, allowed: TextAssetKind[]): ContentAssets | null {
  const parsed = contentPackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const all: ContentAssets = {
    linkedin: tidy(d.linkedin),
    instagram: tidy(d.instagram),
    video_hook: d.video.split("\n").map(tidy).filter(Boolean).join("\n"),
    blog: [tidy(d.blogTitle), tidy(d.blogIntro)].filter(Boolean).join("\n\n"),
    snippet: tidy(d.snippet),
    tags: [...new Set(d.tags.map((t) => tidy(t).toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 5).join("\n"),
  };
  const out: ContentAssets = {};
  for (const k of allowed) if (all[k]) out[k] = all[k];
  return Object.keys(out).length ? out : null;
}

/**
 * When the model can't be used: assets made only from what the person wrote (no new copy). The
 * video hook needs writing, so it is left out.
 */
export function contentPackFallback(
  s: { headline: string; story: string; pullQuote: string; skills: string[]; sector: string },
  allowed: TextAssetKind[],
): ContentAssets {
  const first = s.story.split(/\n\s*\n/)[0]?.trim() ?? "";
  const all: ContentAssets = {
    linkedin: s.story.trim(),
    instagram: s.pullQuote.trim(),
    blog: [s.headline.trim(), first].filter(Boolean).join("\n\n"),
    snippet: s.pullQuote.trim(),
    tags: [...new Set([...s.skills, s.sector].map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5).join("\n"),
  };
  const out: ContentAssets = {};
  for (const k of allowed) if (all[k]) out[k] = all[k];
  return out;
}
