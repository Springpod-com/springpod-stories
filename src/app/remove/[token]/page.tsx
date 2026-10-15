import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { SiteHeader } from "@/components/site-header";
import { RemoveStory } from "@/components/story/remove-story";
import { removeView } from "@/lib/server/publishing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remove my story | Work Experience Stories", robots: { index: false } };

/** "Remove my story" from any email (PRD 9.3). Opening the page doesn't remove anything. COPY GAP G8. */
export default async function RemovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await removeView(token);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-130 flex-col gap-6 px-4 pt-8 pb-12">
        {result.ok ? (
          <>
            <h1 className="ds-h4">Remove my story</h1>
            {result.headline && <p className="ds-p3 font-serif">&ldquo;{result.headline}&rdquo;</p>}
            <RemoveStory token={token} removed={result.removed} />
          </>
        ) : (
          <>
            <h1 className="ds-h4">This link doesn&apos;t work</h1>
            <Alert variant="info" data-placeholder>
              <AlertTitle>Copy needed (G8)</AlertTitle>
              <AlertDescription>What to do next goes here.</AlertDescription>
            </Alert>
          </>
        )}
      </main>
    </div>
  );
}
