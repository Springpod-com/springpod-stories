"use client";

// MILESTONE 1 PLACEHOLDER. Drafting arrives in milestone 5.
// Each screen uses the prototype title and a clearly marked build notice so the flow can be clicked through.

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { Tag } from "@springpod/design-system/components/ui/tag";
import type { RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions } from "@/components/flow/layout";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { cardLines, displayName, previewTrust } from "@/flow/display";
import { sampleStoryText } from "@/flow/sample";
import { ownWords } from "@/flow/source";
import type { FlowState } from "@/flow/state";
import { fallbackDraft } from "@/lib/ai/fallbacks";

interface Props {
  state: FlowState;
  onChange: (next: FlowState) => void;
  onNext: (next?: FlowState) => void;
  onChangeFormat: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

function BuildNotice({ milestone, children }: { milestone: number; children: string }) {
  return (
    <Alert variant="info" data-placeholder>
      <AlertTitle>Build placeholder (milestone {milestone})</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function DraftPlaceholder({ state, onChange, onNext, headingRef }: Props) {
  const draft = state.draft ?? fallbackDraft(ownWords(state) || sampleStoryText(state), state.expType, state.role);
  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} title="Here's your story. Does it sound like you?" sub="Edit anything you like." />
      <BuildNotice milestone={5}>
        Draft editing, the three quote options and Try a different version go here. This uses the offline fallback draft.
      </BuildNotice>
      <h2 className="ds-h6">{draft.headline}</h2>
      <QuoteCard quote={draft.pullQuote} name={displayName(state)} trust={previewTrust(state)} {...cardLines(state)} className="max-w-80 self-center" />
      <div className="flex flex-wrap gap-2">
        {draft.skills.map((s) => (
          <Tag key={s}>{s}</Tag>
        ))}
      </div>
      <StickyActions>
        <Button
          className="w-full"
          onClick={() => {
            const next = { ...state, draft };
            onChange(next);
            onNext(next);
          }}
        >
          Looks good
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
