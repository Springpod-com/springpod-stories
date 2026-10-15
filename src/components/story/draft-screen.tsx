"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { FormSelectButton, FormSelectGroup } from "@springpod/design-system/components/ui/form-select-button";
import { Input } from "@springpod/design-system/components/ui/input";
import { Label } from "@springpod/design-system/components/ui/label";
import { Spinner } from "@springpod/design-system/components/ui/spinner";
import { Tag } from "@springpod/design-system/components/ui/tag";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "@/components/flow/layout";
import { writeDraftRequest } from "@/components/flow/persistence";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { cardLines, displayName, previewTrust } from "@/flow/display";
import { findQuestion, validationError } from "@/flow/engine";
import { QUESTIONS } from "@/flow/questions";
import type { Draft, FlowState } from "@/flow/state";
import { MAX_QUOTE_CHARS } from "@/lib/ai/draft";
import { track } from "@/lib/track";

interface Props {
  state: FlowState;
  onChange: (next: FlowState) => void;
  onNext: (next?: FlowState) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/**
 * The written-up story (PRD 8): edit the headline and story, pick one of three quotes or write
 * your own, "Try a different version" and "Go back to previous version". Copy from the prototype.
 */
export function DraftScreen({ state, onChange, onNext, headingRef }: Props) {
  const [writing, setWriting] = useState(!state.draft);
  const [failure, setFailure] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quotesId = useId();
  const ownQuoteId = useId();
  const errorId = useId();
  const started = useRef(false);

  const write = useCallback(
    async (different: boolean) => {
      setWriting(true);
      setFailure(null);
      setError(null);
      const result = await writeDraftRequest(state, different);
      setWriting(false);
      if ("message" in result) return setFailure(result.message);
      setFallback(result.fallback);
      track(different ? "draft_regenerated" : "draft_generated", {});
      onChange({ ...state, draft: result.draft, previousDraft: result.previousDraft });
    },
    [state, onChange],
  );

  // Write it up on arrival if there's no draft yet.
  useEffect(() => {
    if (started.current || state.draft) return;
    started.current = true;
    void write(false);
  }, [state.draft, write]);

  if (writing || (!state.draft && !failure)) {
    return (
      <ScreenBody>
        <QuestionHeading ref={headingRef} title="Writing your story…" sub="Usually under a minute." />
        <Alert variant="info" aria-live="polite">
          <AlertDescription className="flex items-center gap-2">
            <Spinner className="size-4" aria-hidden />
            Writing…
          </AlertDescription>
        </Alert>
      </ScreenBody>
    );
  }

  if (!state.draft) {
    return (
      <ScreenBody>
        <QuestionHeading ref={headingRef} title="Writing your story…" />
        {/* COPY GAP G6: placeholder. */}
        <Alert variant="destructive" data-placeholder>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
        <StickyActions>
          <Button className="w-full" onClick={() => void write(false)}>
            Try again
          </Button>
        </StickyActions>
      </ScreenBody>
    );
  }

  const draft = state.draft;
  const update = (change: Partial<Draft>) => {
    setError(null);
    onChange({ ...state, draft: { ...draft, ...change } });
  };

  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} title="Here's your story. Does it sound like you?" sub="Edit anything you like." />
      {state.previousDraft && (
        <Alert variant="info">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            New version written.
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...state, draft: state.previousDraft, previousDraft: null })}
            >
              Go back to previous version
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {fallback && (
        // COPY GAP G6: placeholder for when drafting fails and the person's own words are used.
        <Alert variant="info" data-placeholder>
          <AlertDescription>We couldn&apos;t write this up for you just now, so here are your own words. Edit them into shape.</AlertDescription>
        </Alert>
      )}
      {/* Named for screen readers only, as in the prototype. */}
      <Input aria-label="Headline" value={draft.headline} maxLength={160} onChange={(e) => update({ headline: e.target.value })} className="font-semibold" />
      <Textarea aria-label="Story" value={draft.story} onChange={(e) => update({ story: e.target.value })} className="min-h-80 font-serif" />
      <div className="flex flex-col gap-3">
        <span id={quotesId} className="ds-p3 font-semibold text-foreground">
          Pick the quote for your card
        </span>
        <FormSelectGroup
          type="single"
          size="mobile"
          value={draft.quoteOptions.includes(draft.pullQuote) ? draft.pullQuote : ""}
          aria-labelledby={quotesId}
          onValueChange={() => {}}
          className="flex flex-col gap-3"
        >
          {draft.quoteOptions.map((q) => (
            <FormSelectButton key={q} value={q} onClick={() => update({ pullQuote: q })} className="w-full justify-start text-left">
              <span className="min-w-0 font-serif">“{q}”</span>
            </FormSelectButton>
          ))}
        </FormSelectGroup>
        <QuoteCard
          quote={draft.pullQuote}
          name={displayName(state)}
          trust={previewTrust(state)}
          {...cardLines(state)}
          className="max-w-80 self-center"
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={ownQuoteId}>Or edit it</Label>
          <Input id={ownQuoteId} value={draft.pullQuote} maxLength={MAX_QUOTE_CHARS} onChange={(e) => update({ pullQuote: e.target.value })} />
        </div>
      </div>
      {draft.skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {draft.skills.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
        </div>
      )}
      <StickyActions>
        <ValidationMessage id={errorId} message={error} />
        <Button
          className="w-full"
          aria-describedby={error ? errorId : undefined}
          onClick={() => {
            const message = validationError(findQuestion(QUESTIONS, "draft"), state);
            if (message) return setError(message);
            const picked = draft.quoteOptions.indexOf(draft.pullQuote);
            track("quote_selected", { option: picked >= 0 ? String(picked) : "custom" });
            const next = { ...state, previousDraft: null };
            onChange(next);
            onNext(next);
          }}
        >
          Looks good
        </Button>
        <Button variant="secondary" onClick={() => void write(true)}>
          Try a different version
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
