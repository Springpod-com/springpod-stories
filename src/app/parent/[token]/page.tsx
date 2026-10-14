import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { ParentDecisionButtons } from "@/components/parent/parent-decision";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { SiteHeader } from "@/components/site-header";
import { CHANNELS } from "@/flow/options";
import { parentView } from "@/lib/server/parent";

export const dynamic = "force-dynamic";
export const metadata = { title: "A story to approve | Work Experience Stories", robots: { index: false } };

/**
 * The parent or carer decision page (PRD 9.1, 14). Shows the story, the quote card and where it
 * may appear, with three choices. Opening the page doesn't record anything.
 * COPY GAP G7: the introduction, confirmations and the expired page are placeholders.
 */
export default async function ParentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await parentView(token);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-130 flex-col gap-6 px-4 pt-8 pb-12">
        {result.ok ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="ds-h4">{result.view.firstName} would like to share their story</h1>
              <Alert variant="info" data-placeholder>
                <AlertTitle>Copy needed (G7)</AlertTitle>
                <AlertDescription>Introduction for the parent or carer goes here: why they are asked and what each choice means.</AlertDescription>
              </Alert>
            </div>
            <article className="flex flex-col gap-3">
              <h2 className="ds-h6">{result.view.headline}</h2>
              {result.view.story.split(/\n\s*\n/).map((p, i) => (
                <p key={i} className="ds-p3 font-serif text-foreground">
                  {p}
                </p>
              ))}
            </article>
            <QuoteCard {...result.view.card} className="max-w-80 self-center" />
            <div className="flex flex-col gap-2">
              <h2 className="ds-p3 font-semibold">Where it may appear</h2>
              <ul className="ds-p3 list-disc pl-5">
                {CHANNELS.filter((c) => result.view.channels.includes(c.value)).map((c) => (
                  <li key={c.value}>{c.label}</li>
                ))}
              </ul>
            </div>
            <ParentDecisionButtons token={token} decided={result.view.decided} />
          </>
        ) : (
          <>
            <h1 className="ds-h4">{result.reason === "expired" ? "This link has expired" : "This link doesn't work"}</h1>
            <Alert variant="info" data-placeholder>
              <AlertTitle>Copy needed (G7)</AlertTitle>
              <AlertDescription>What to do next goes here.</AlertDescription>
            </Alert>
          </>
        )}
      </main>
    </div>
  );
}
