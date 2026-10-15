"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Avatar, AvatarFallback } from "@springpod/design-system/components/ui/avatar";
import { Button } from "@springpod/design-system/components/ui/button";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { IconChat } from "@springpod/design-system/icons/platform/chat";
import { IconLongArrowRight } from "@springpod/design-system/icons/platform/long-arrow-right";
import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "@/components/flow/layout";
import { interviewAnswers, MIN_INTERVIEW_ANSWERS, type FlowState, type Turn } from "@/flow/state";
import { QUICK_REPLIES } from "@/lib/ai/prompts";
import { pickDraftAnswers } from "@/lib/draft-answers";
import { StoryStrength } from "./story-strength";

/** COPY GAP G5 and G17: placeholders until the error copy is written. */
const UNREACHABLE = "We couldn't reach the interviewer. Try sending again.";
const RATE_LIMITED = "Too many messages too quickly. Wait a moment, then try again.";

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; text: string; ended: boolean; safeguarding: boolean };

/** Reads the newline-delimited JSON events from /api/interview/turn. */
async function* readEvents(res: Response): AsyncGenerator<StreamEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
}

function InterviewerAvatar() {
  // No rocket anywhere in the product (build plan M1.19): the chat glyph on navy.
  return (
    <Avatar size="sm" aria-hidden className="mt-auto shrink-0">
      <AvatarFallback className="bg-brand-navy text-white">
        <IconChat size={16} />
      </AvatarFallback>
    </Avatar>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "assistant") {
    return (
      <div className="flex items-end gap-2">
        <InterviewerAvatar />
        <p className="ds-p3 max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-4 py-3 text-foreground">{turn.content}</p>
      </div>
    );
  }
  return (
    <p className="ds-p3 max-w-[85%] self-end rounded-3xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
      {turn.content}
    </p>
  );
}

function Typing() {
  return (
    <div className="flex items-end gap-2">
      <InterviewerAvatar />
      <span role="status" aria-label="Typing" className="flex gap-1 rounded-3xl rounded-bl-md bg-muted px-4 py-4">
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className="size-2 rounded-full bg-muted-foreground motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * "Interview me" (PRD 6.1): a chat with the AI interviewer, one short question at a time.
 * Replies stream in; every turn is saved on the server so the interview can resume.
 */
export function InterviewScreen({
  state,
  setState,
  onNext,
  onChangeFormat,
  headingRef,
}: {
  state: FlowState;
  setState: Dispatch<SetStateAction<FlowState>>;
  onNext: (next?: FlowState) => void;
  onChangeFormat: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composerId = useId();
  const errorId = useId();

  useEffect(() => {
    stateRef.current = state;
  });

  const asked = state.turns.filter((t) => t.role === "assistant").length;
  const answered = interviewAnswers(state);
  const ended = state.interviewEnded;

  const send = useCallback(
    async (message: { text: string; quickReply: boolean } | null) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      if (message) {
        const turn: Turn = { role: "user", content: message.text, ...(message.quickReply ? { quickReply: true } : {}) };
        setState((s) => ({ ...s, turns: [...s.turns, turn], draft: null }));
      }
      setPending("");
      try {
        const res = await fetch("/api/interview/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: pickDraftAnswers(stateRef.current), message }),
        });
        if (res.status === 429) throw new Error(RATE_LIMITED);
        if (!res.ok || !res.body) throw new Error(UNREACHABLE);
        let text = "";
        for await (const event of readEvents(res)) {
          if (event.type === "delta") setPending((text += event.text));
          else if (event.type === "replace") setPending((text = event.text));
          else {
            const reply = event.text;
            setState((s) => ({
              ...s,
              turns: s.turns.at(-1)?.role === "assistant" && s.turns.at(-1)?.content === reply ? s.turns : [...s.turns, { role: "assistant", content: reply }],
              interviewEnded: s.interviewEnded || event.ended,
            }));
          }
        }
        setDraft("");
      } catch (e) {
        // Put the answer back in the box so nothing is lost.
        if (message) {
          setState((s) => ({ ...s, turns: s.turns.slice(0, -1) }));
          if (!message.quickReply) setDraft(message.text);
        }
        setError(e instanceof Error && e.message === RATE_LIMITED ? RATE_LIMITED : UNREACHABLE);
      } finally {
        setPending(null);
        setBusy(false);
      }
    },
    [busy, setState],
  );

  // Start the interview the first time the screen opens.
  useEffect(() => {
    if (started.current || state.turns.length || state.interviewEnded) return;
    started.current = true;
    void send(null);
  }, [send, state.turns.length, state.interviewEnded]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.turns.length, pending]);

  const finish = async () => {
    setBusy(true);
    const res = await fetch("/api/interview/finish", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(UNREACHABLE);
    const next = { ...stateRef.current, interviewEnded: true, draft: null };
    setState(next);
    onNext(next);
  };

  const submitAnswer = () => {
    const text = draft.trim();
    if (text) void send({ text, quickReply: false });
  };

  return (
    <ScreenBody>
      <QuestionHeading
        ref={headingRef}
        title="Your interview"
        sub={
          <>
            {ended ? "Interview complete" : asked ? `Question ${asked} of about 6` : "Starting"} ·{" "}
            <Button variant="link" size="sm" className="h-auto px-0 align-baseline" onClick={onChangeFormat}>
              Change how I tell it
            </Button>
          </>
        }
      />
      <StoryStrength state={state} />

      <div role="log" aria-live="polite" aria-label="Interview" className="flex flex-col gap-3">
        {state.turns.map((turn, i) => (
          <Bubble key={i} turn={turn} />
        ))}
        {pending !== null && (pending ? <Bubble turn={{ role: "assistant", content: pending }} /> : <Typing />)}
        <div ref={bottom} />
      </div>

      {ended ? (
        <>
          <Alert variant="success">
            <AlertDescription className="ds-p3">That&apos;s everything. Next, we&apos;ll write it up for you to check.</AlertDescription>
          </Alert>
          <StickyActions>
            <Button
              className="w-full"
              onClick={() => {
                const next = { ...state, draft: null };
                setState(next);
                onNext(next);
              }}
            >
              Write up my story
            </Button>
          </StickyActions>
        </>
      ) : (
        <StickyActions className="items-stretch">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !asked}
              onClick={() => send({ text: QUICK_REPLIES.differently, quickReply: true })}
            >
              Ask it differently
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !asked}
              onClick={() => send({ text: QUICK_REPLIES.skip, quickReply: true })}
            >
              Skip this one
            </Button>
            {answered >= MIN_INTERVIEW_ANSWERS && (
              <Button variant="outline" size="sm" disabled={busy} onClick={finish} className="border-brand-teal-800 text-brand-teal-800">
                I&apos;m done, write it up
              </Button>
            )}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitAnswer();
            }}
          >
            <Textarea
              id={composerId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitAnswer();
                }
              }}
              placeholder="Type your answer"
              aria-label="Your answer"
              aria-describedby={error ? errorId : undefined}
              enterKeyHint="send"
              maxLength={2000}
              className="min-h-12 flex-1 resize-none"
              rows={1}
            />
            <Button type="submit" variant="teal" size="icon-mobile" aria-label="Send" disabled={busy}>
              <IconLongArrowRight size={24} />
            </Button>
          </form>
          <ValidationMessage id={errorId} message={error} />
          <span className="ds-p5 text-muted-foreground">Leave out your surname, school, address and phone number.</span>
        </StickyActions>
      )}
    </ScreenBody>
  );
}
