import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { SiteHeader } from "@/components/site-header";
import { confirmStoryEmail } from "@/lib/server/stories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email | Work Experience Stories", robots: { index: false } };

/**
 * Landing page for the confirm link (PRD 14). Opening it confirms the email; opening it again is harmless.
 * COPY GAP G1: the wording on this page is a placeholder until copy is supplied.
 */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await confirmStoryEmail(token);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-130 flex-col gap-6 px-4 pt-8">
        {result.ok ? (
          <>
            <h1 className="ds-h4">Email confirmed</h1>
            <Alert variant="info" data-placeholder>
              <AlertTitle>Copy needed (G1)</AlertTitle>
              <AlertDescription>What happens next goes here.</AlertDescription>
            </Alert>
          </>
        ) : (
          <>
            <h1 className="ds-h4">{result.reason === "expired" ? "This link has expired" : "This link doesn't work"}</h1>
            <Alert variant="info" data-placeholder>
              <AlertTitle>Copy needed (G1)</AlertTitle>
              <AlertDescription>What to do next goes here.</AlertDescription>
            </Alert>
          </>
        )}
      </main>
    </div>
  );
}
