"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { Tag } from "@springpod/design-system/components/ui/tag";
import type { RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions } from "@/components/flow/layout";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { cardLines, displayName, previewTrust } from "@/flow/display";
import { firstName, isMinor, type FlowState } from "@/flow/state";
import { Celebration } from "./celebration";

export function DoneScreen({
  state,
  onAnother,
  headingRef,
}: {
  state: FlowState;
  onAnother: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const skills = state.draft?.skills ?? [];
  return (
    <ScreenBody>
      <Celebration />
      <QuestionHeading ref={headingRef} title={`Thanks, ${firstName(state)}. Your story is in.`} />
      <div className="flex flex-col gap-3">
        <Alert variant="success">
          <AlertDescription className="ds-p3">Check your email to confirm it&apos;s you.</AlertDescription>
        </Alert>
        {isMinor(state) && (
          <Alert variant="warning">
            <AlertDescription className="ds-p3">We&apos;ve asked {state.parentEmail} to agree.</AlertDescription>
          </Alert>
        )}
        <Alert variant="info">
          <AlertDescription className="ds-p3">
            Our team checks it, usually within 3 working days. We&apos;ll email you a link to share when it&apos;s live.
          </AlertDescription>
        </Alert>
      </div>
      {skills.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="ds-p3">Skills in your story</span>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
        </div>
      )}
      <QuoteCard
        quote={state.draft?.pullQuote ?? ""}
        name={displayName(state)}
        trust={previewTrust(state)}
        {...cardLines(state)}
        className="max-w-65 self-center"
      />
      <StickyActions>
        <Button className="w-full" onClick={onAnother}>
          Share another story
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
