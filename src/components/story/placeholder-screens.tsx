"use client";

// MILESTONE 1 PLACEHOLDERS. Capture, transcript and drafting arrive in milestones 3 to 5.
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

const MEDIA_SCREEN = {
  video: { title: "Film your video", milestone: 4, note: "Film now, upload a file, and the video checks go here." },
  voice: { title: "Record your voice note", milestone: 4, note: "Record now, upload a file, and the voice note checks go here." },
} as const;

/** Voice note and video capture arrive in milestone 4. */
export function MediaPlaceholder({ state, onChange, onNext, onChangeFormat, headingRef }: Props) {
  const screen = MEDIA_SCREEN[state.format === "voice" ? "voice" : "video"];
  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} title={screen.title} />
      <BuildNotice milestone={screen.milestone}>{`${screen.note} For now, Continue fills in sample text.`}</BuildNotice>
      <StickyActions>
        <Button
          className="w-full"
          onClick={() => {
            const text = sampleStoryText(state);
            const next = { ...state, written: text, transcript: text, draft: null };
            onChange(next);
            onNext(next);
          }}
        >
          Continue
        </Button>
        <Button variant="link" size="sm" onClick={onChangeFormat}>
          Change how I tell it
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}

export function TranscriptPlaceholder({ state, onNext, headingRef }: Props) {
  const kind = state.format === "video" ? "video" : "voice note";
  return (
    <ScreenBody>
      <QuestionHeading
        ref={headingRef}
        title="Check your transcript"
        sub={`We turned your ${kind} into text. Fix anything we misheard, especially names and places.`}
      />
      <BuildNotice milestone={4}>The editable transcript goes here.</BuildNotice>
      <StickyActions>
        <Button className="w-full" onClick={() => onNext()}>
          Write up my story
        </Button>
      </StickyActions>
    </ScreenBody>
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
