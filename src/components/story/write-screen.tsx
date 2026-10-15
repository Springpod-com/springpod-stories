"use client";

import { Button } from "@springpod/design-system/components/ui/button";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "@/components/flow/layout";
import { findQuestion, validationError } from "@/flow/engine";
import { QUESTIONS } from "@/flow/questions";
import { wordCount, type FlowState } from "@/flow/state";

/** "Write it" (PRD 6.2): one large box, live word count, at least 40 words. */
export function WriteScreen({
  state,
  onChange,
  onNext,
  onChangeFormat,
  headingRef,
}: {
  state: FlowState;
  onChange: (next: FlowState) => void;
  onNext: (next?: FlowState) => void;
  onChangeFormat: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const headingId = useId();
  const subId = useId();
  const countId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  return (
    <ScreenBody>
      <QuestionHeading
        ref={headingRef}
        id={headingId}
        subId={subId}
        title="Tell us what happened"
        sub={
          <>
            Cover what you did, one moment that stood out, what was hard, and your advice for someone starting out.{" "}
            <Button variant="link" size="sm" className="h-auto px-0 align-baseline" onClick={onChangeFormat}>
              Change how I tell it
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-2">
        <Textarea
          ref={box}
          value={state.written}
          onChange={(e) => {
            onChange({ ...state, written: e.target.value });
            setError(null);
          }}
          aria-labelledby={headingId}
          aria-describedby={[subId, countId, error ? errorId : ""].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          className="min-h-72 font-serif"
        />
        <span id={countId} className="ds-p5 font-mono text-muted-foreground" aria-live="polite">
          {wordCount(state.written)} words · 150 to 400 works best
        </span>
      </div>
      <StickyActions>
        <ValidationMessage id={errorId} message={error} />
        <Button
          className="w-full"
          onClick={() => {
            const message = validationError(findQuestion(QUESTIONS, "story"), state);
            if (message) setError(message);
            else {
              // A changed story needs a fresh draft.
              const next = { ...state, draft: null };
              onChange(next);
              onNext(next);
            }
          }}
        >
          Write up my story
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
