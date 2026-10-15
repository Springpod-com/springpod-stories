import { notFound } from "next/navigation";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { cardLines, displayName } from "@/flow/display";
import { stateFromStory } from "@/lib/story-data";
import { db } from "@/lib/server/db";
import { verifyRender } from "@/lib/server/render-sign";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/**
 * The quote card on its own, for the worker to screenshot as a PNG (PRD 5.4, 12): the same
 * component as the flow and the admin. Opens only with a short-lived signed link.
 */
export default async function QuoteCardRender({
  params,
  searchParams,
}: {
  params: Promise<{ storyId: string }>;
  searchParams: Promise<{ shape?: string; exp?: string; sig?: string }>;
}) {
  const { storyId } = await params;
  const { shape = "", exp = "", sig = "" } = await searchParams;
  if ((shape !== "portrait" && shape !== "story") || !verifyRender(storyId, shape, exp, sig)) notFound();
  const story = await db.story.findUnique({ where: { id: storyId } });
  if (!story) notFound();
  const state = stateFromStory(story);
  return (
    <div className="w-90" data-render-card>
      <QuoteCard
        quote={story.pullQuote ?? ""}
        name={displayName(state)}
        trust={story.trustLabel}
        shape={shape}
        {...cardLines(state)}
        flat
      />
    </div>
  );
}
