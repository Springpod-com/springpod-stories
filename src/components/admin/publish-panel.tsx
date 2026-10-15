"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { Input } from "@springpod/design-system/components/ui/input";
import { Label } from "@springpod/design-system/components/ui/label";
import { useId, useState, useTransition } from "react";
import { markPublishedAction } from "@/app/admin/actions";
import { ValidationMessage } from "@/components/flow/layout";

/**
 * "Published" (PRD 14, sent from the admin): the team adds the link where the story went live, and
 * the person is emailed it with their quote card. COPY GAP G12: labels are placeholders.
 */
export function PublishPanel({ storyId, published }: { storyId: string; published: { at: Date; url: string | null } | null }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  if (published) {
    return (
      <Alert variant="success" data-published>
        <AlertDescription>
          Published {new Date(published.at).toLocaleDateString("en-GB")}
          {published.url && (
            <>
              {" "}
              at{" "}
              <a href={published.url} className="underline" target="_blank" rel="noreferrer">
                {published.url}
              </a>
            </>
          )}
          . The person has been emailed.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Link to the published story</Label>
      <div className="flex flex-wrap gap-3">
        <Input id={id} type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-0 flex-1" />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await markPublishedAction(storyId, url);
              if (!result.ok) setError(result.problem);
            })
          }
        >
          Mark as published
        </Button>
      </div>
      <ValidationMessage message={error} />
    </div>
  );
}
