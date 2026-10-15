"use client";

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { FormSelectButton, FormSelectGroup } from "@springpod/design-system/components/ui/form-select-button";
import { Input } from "@springpod/design-system/components/ui/input";
import { Label } from "@springpod/design-system/components/ui/label";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { useId, useState } from "react";
import { ValidationMessage } from "@/components/flow/layout";
import { MAX_QUOTE_CHARS } from "@/lib/ai/draft";
import type { EditView } from "@/lib/server/edit";

/**
 * Edit after changes requested (build plan Q16): the team's message, then the story to edit, as on
 * the draft screen. COPY GAP G9: the heading, message framing and confirmation are placeholders.
 */
export function EditStoryForm({ token, view }: { token: string; view: EditView }) {
  const [headline, setHeadline] = useState(view.headline);
  const [story, setStory] = useState(view.story);
  const [pullQuote, setPullQuote] = useState(view.pullQuote);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const quotesId = useId();
  const quoteId = useId();

  const send = async () => {
    if (busy) return;
    if (!headline.trim() || !story.trim() || !pullQuote.trim()) return setError("Add a headline, your story and a quote for your card");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/edit/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline, story, pullQuote }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
    } catch {
      setError("We couldn't send your story. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Alert variant="success" data-placeholder data-done>
        <AlertTitle>Thanks. Your story is back with the team.</AlertTitle>
        <AlertDescription>[Copy needed G9] What happens next goes here.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="info">
        <AlertTitle>A message from the Springpod team</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap">{view.message}</AlertDescription>
      </Alert>
      <Input aria-label="Headline" value={headline} maxLength={160} onChange={(e) => setHeadline(e.target.value)} className="font-semibold" />
      <Textarea aria-label="Story" value={story} onChange={(e) => setStory(e.target.value)} className="min-h-80 font-serif" />
      <div className="flex flex-col gap-3">
        <span id={quotesId} className="ds-p3 font-semibold text-foreground">
          Pick the quote for your card
        </span>
        <FormSelectGroup type="single" size="mobile" value={view.quoteOptions.includes(pullQuote) ? pullQuote : ""} aria-labelledby={quotesId} onValueChange={() => {}} className="flex flex-col gap-3">
          {view.quoteOptions.map((q) => (
            <FormSelectButton key={q} value={q} onClick={() => setPullQuote(q)} className="w-full justify-start text-left">
              <span className="min-w-0 font-serif">“{q}”</span>
            </FormSelectButton>
          ))}
        </FormSelectGroup>
        <Label htmlFor={quoteId}>Or edit it</Label>
        <Input id={quoteId} value={pullQuote} maxLength={MAX_QUOTE_CHARS} onChange={(e) => setPullQuote(e.target.value)} />
      </div>
      <div className="flex flex-col items-center gap-3">
        <ValidationMessage message={error} />
        <Button className="w-full" onClick={() => void send()}>
          Send my story
        </Button>
      </div>
    </div>
  );
}
