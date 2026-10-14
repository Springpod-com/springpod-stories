"use client";

import { Card } from "@springpod/design-system/components/ui/card";
import { cn } from "@springpod/design-system/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { DoneScreen } from "@/components/done/done-screen";
import { GuideScreen } from "@/components/media/guide-screen";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { StartScreen } from "@/components/start/start-screen";
import { DraftPlaceholder, StoryPlaceholder, TranscriptPlaceholder } from "@/components/story/placeholder-screens";
import { cardLines, displayName, previewTrust } from "@/flow/display";
import { chapterName, chapterProgress, findQuestion, nextId, prevId, reachableId } from "@/flow/engine";
import { QUESTIONS, type Question } from "@/flow/questions";
import { initialState, resetForAnotherStory, type FlowState } from "@/flow/state";
import { ChapterProgress } from "./chapter-progress";
import { MultiChoiceScreen, SingleChoiceScreen, StopScreen, TextScreen } from "./question-screens";

const STEP_PARAM = "q";

/** Marks history entries this flow pushed, so the on-screen back arrow can use the browser's history. */
interface StepHistoryState {
  wesStep: string;
  wesIndex: number;
}

function stepUrl(id: string) {
  const url = new URL(window.location.href);
  if (id === "intro") url.searchParams.delete(STEP_PARAM);
  else url.searchParams.set(STEP_PARAM, id);
  return url.pathname + url.search;
}

/**
 * The public story flow: one question per screen, driven by the question config.
 * State lives in the browser in milestone 1; server autosave arrives in milestone 2.
 */
export function StoryFlow({ questions = QUESTIONS }: { questions?: Question[] }) {
  const [state, setState] = useState<FlowState>(initialState);
  const [currentId, setCurrentId] = useState("intro");
  const [direction, setDirection] = useState<1 | -1>(1);
  const stateRef = useRef(state);
  const currentRef = useRef(currentId);
  // The steps this tab has visited, in history order, and where we are in them.
  const trail = useRef<string[]>(["intro"]);
  const position = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    stateRef.current = state;
    currentRef.current = currentId;
  });

  // Nothing is stored yet, so a reload or a shared link always starts at the start screen.
  useEffect(() => {
    window.history.replaceState({ wesStep: "intro", wesIndex: 0 } satisfies StepHistoryState, "", stepUrl("intro"));
    const onPop = (e: PopStateEvent) => {
      const entry = e.state as StepHistoryState | null;
      const requested = entry?.wesStep ?? "intro";
      position.current = entry?.wesIndex ?? 0;
      const target = reachableId(questions, requested, stateRef.current);
      trail.current[position.current] = target;
      setDirection(-1);
      setCurrentId(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [questions]);

  // Move focus to the new question so screen readers announce it, unless the screen focused an input itself.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [currentId]);

  const go = useCallback((id: string) => {
    if (id === currentRef.current) return;
    position.current += 1;
    trail.current = [...trail.current.slice(0, position.current), id];
    window.history.pushState({ wesStep: id, wesIndex: position.current } satisfies StepHistoryState, "", stepUrl(id));
    currentRef.current = id;
    setDirection(1);
    setCurrentId(id);
  }, []);

  const goNext = useCallback(
    (next?: FlowState) => {
      const s = next ?? stateRef.current;
      stateRef.current = s;
      go(nextId(questions, currentRef.current, s));
    },
    [questions, go],
  );

  const goBack = useCallback(() => {
    const target = prevId(questions, currentRef.current, stateRef.current);
    if (target === currentRef.current) return;
    if (position.current > 0 && trail.current[position.current - 1] === target) {
      window.history.back();
      return;
    }
    trail.current[position.current] = target;
    window.history.replaceState(
      { wesStep: target, wesIndex: position.current } satisfies StepHistoryState,
      "",
      stepUrl(target),
    );
    currentRef.current = target;
    setDirection(-1);
    setCurrentId(target);
  }, [questions]);

  const q = findQuestion(questions, currentId);
  const showTopBar = !["intro", "stop", "done"].includes(q.kind);
  const common = { state, onChange: setState, onNext: goNext, headingRef };

  let screen: React.ReactNode = null;
  switch (q.kind) {
    case "intro":
      screen = <StartScreen onStart={() => goNext()} headingRef={headingRef} />;
      break;
    case "single":
      screen = (
        <SingleChoiceScreen
          key={q.id}
          question={q}
          {...common}
          preview={
            q.preview && (
              <QuoteCard
                quote={state.draft?.pullQuote ?? ""}
                name={displayName(state)}
                trust={previewTrust(state)}
                {...cardLines(state)}
                className="max-w-80 self-center"
              />
            )
          }
        />
      );
      break;
    case "text":
      screen = <TextScreen key={q.id} question={q} {...common} />;
      break;
    case "multi":
    case "confirm":
      screen = <MultiChoiceScreen key={q.id} question={q} {...common} />;
      break;
    case "stop":
      screen = <StopScreen onChangeAge={() => go("age")} headingRef={headingRef} />;
      break;
    case "guide":
      screen = <GuideScreen format={state.format === "video" ? "video" : "voice"} onNext={() => goNext()} headingRef={headingRef} />;
      break;
    case "story":
      screen = <StoryPlaceholder {...common} onChangeFormat={() => go("mode")} />;
      break;
    case "transcript":
      screen = <TranscriptPlaceholder {...common} onChangeFormat={() => go("mode")} />;
      break;
    case "draft":
      screen = <DraftPlaceholder {...common} onChangeFormat={() => go("mode")} />;
      break;
    case "done":
      screen = (
        <DoneScreen
          state={state}
          headingRef={headingRef}
          onAnother={() => {
            setState(resetForAnotherStory(stateRef.current));
            go("intro");
          }}
        />
      );
      break;
  }

  const isIntro = q.kind === "intro";

  return (
    <main className="mx-auto flex w-full max-w-130 flex-1 flex-col gap-4 px-4 pt-4 pb-0 md:pt-8 md:pb-12">
      {showTopBar && (
        <ChapterProgress
          chapters={chapterProgress(questions, currentId, state)}
          current={chapterName(questions, currentId)}
          onBack={goBack}
          canGoBack={currentId !== "intro"}
        />
      )}
      <div
        key={currentId}
        data-step={currentId}
        className={cn(
          "flex flex-1 flex-col md:flex-none",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
          direction > 0 ? "motion-safe:slide-in-from-right-4" : "motion-safe:slide-in-from-left-4",
        )}
      >
        {isIntro ? (
          <div className="pb-6">{screen}</div>
        ) : (
          <Card className="flex flex-1 flex-col rounded-none border-0 bg-transparent shadow-none md:rounded-3xl md:border md:bg-card md:p-8 md:shadow-md">
            {screen}
          </Card>
        )}
      </div>
    </main>
  );
}
