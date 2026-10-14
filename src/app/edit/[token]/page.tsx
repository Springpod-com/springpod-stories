import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { SiteHeader } from "@/components/site-header";
import { EditStoryForm } from "@/components/story/edit-story-form";
import { editView } from "@/lib/server/edit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit your story | Work Experience Stories", robots: { index: false } };

/** The link in the "changes requested" email (PRD 14). COPY GAP G9: the page wording is a placeholder. */
export default async function EditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await editView(token);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-130 flex-col gap-6 px-4 pt-8 pb-12">
        {result.ok ? (
          <>
            <h1 className="ds-h4">Edit your story, {result.view.firstName}</h1>
            <EditStoryForm token={token} view={result.view} />
          </>
        ) : (
          <>
            <h1 className="ds-h4">
              {result.reason === "expired" ? "This link has expired" : result.reason === "done" ? "Your story is already back with the team" : "This link doesn't work"}
            </h1>
            <Alert variant="info" data-placeholder>
              <AlertTitle>Copy needed (G9)</AlertTitle>
              <AlertDescription>What to do next goes here.</AlertDescription>
            </Alert>
          </>
        )}
      </main>
    </div>
  );
}
