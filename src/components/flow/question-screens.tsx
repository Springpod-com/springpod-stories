"use client";

import { Button } from "@springpod/design-system/components/ui/button";
import { FormSelectButton, FormSelectGroup } from "@springpod/design-system/components/ui/form-select-button";
import { Input } from "@springpod/design-system/components/ui/input";
import { Spinner } from "@springpod/design-system/components/ui/spinner";
import { cn } from "@springpod/design-system/lib/utils";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { MultiQuestion, Option, SingleQuestion, TextQuestion } from "@/flow/questions";
import type { FlowState } from "@/flow/state";
import { OptionIcon } from "./option-icon";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "./layout";

/** Pause after a single-choice tap so the selection registers before moving on (PRD 5.1). */
export const ADVANCE_DELAY_MS = 260;

interface ScreenProps<Q> {
  question: Q;
  state: FlowState;
  onChange: (next: FlowState) => void;
  /** May return an error message (for example when sending the story fails). */
  onNext: (next?: FlowState) => void | Promise<string | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

function OptionContent({ option }: { option: Option }) {
  return (
    <>
      {option.icon && (
        <span className="shrink-0">
          <OptionIcon icon={option.icon} />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span>{option.label}</span>
        {option.description && <span className="ds-p4 opacity-80">{option.description}</span>}
      </span>
    </>
  );
}

const GROUP_LAYOUT = {
  list: "flex flex-col gap-3",
  grid: "grid grid-cols-2 gap-3",
  "grid-compact": "grid grid-cols-2 gap-2",
} as const;

export function SingleChoiceScreen({
  question: q,
  state,
  onChange,
  onNext,
  headingRef,
  preview,
}: ScreenProps<SingleQuestion> & { preview?: ReactNode }) {
  const headingId = useId();
  const value = q.get(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layout = q.layout ?? "list";

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const choose = (v: string) => {
    const next = q.set(state, v);
    onChange(next);
    // Screens with a card preview stay put so the person can see the change.
    if (q.preview) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onNext(next), ADVANCE_DELAY_MS);
  };

  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} id={headingId} title={q.title?.(state)} sub={q.sub?.(state)} />
      {preview}
      <FormSelectGroup
        type="single"
        size="mobile"
        value={value}
        aria-labelledby={headingId}
        // Taps are handled per button so tapping the current answer still moves on.
        onValueChange={() => {}}
        className={GROUP_LAYOUT[layout]}
      >
        {q.options(state).map((o) => (
          <FormSelectButton
            key={o.value}
            value={o.value}
            onClick={() => choose(o.value)}
            className={cn(
              "w-full gap-4",
              layout === "list" && "justify-start text-left",
              layout === "grid" && "px-3",
              layout === "grid-compact" && "px-3 py-3",
            )}
          >
            <OptionContent option={o} />
          </FormSelectButton>
        ))}
      </FormSelectGroup>
      {value && (
        <StickyActions>
          <Button
            className="w-full"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              onNext();
            }}
          >
            Continue
          </Button>
        </StickyActions>
      )}
    </ScreenBody>
  );
}

export function MultiChoiceScreen({ question: q, state, onChange, onNext, headingRef }: ScreenProps<MultiQuestion>) {
  const headingId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = q.options(state);
  const value = q.get(state);
  const all = value.length === options.length;

  const update = (values: string[]) => {
    onChange(q.set(state, values));
    setError(null);
  };

  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} id={headingId} title={q.title?.(state)} sub={q.sub?.(state)} />
      <div className="flex flex-col items-start gap-3">
        <FormSelectGroup
          type="multiple"
          size="mobile"
          value={value}
          onValueChange={update}
          aria-labelledby={headingId}
          aria-describedby={error ? errorId : undefined}
          className="flex w-full flex-col gap-3"
        >
          {options.map((o) => (
            <FormSelectButton key={o.value} value={o.value} className="w-full justify-start gap-4 text-left">
              <OptionContent option={o} />
            </FormSelectButton>
          ))}
        </FormSelectGroup>
        {q.selectAll && (
          <Button variant="link" size="sm" className="px-0" onClick={() => update(all ? [] : options.map((o) => o.value))}>
            {all ? "Clear all" : "Select all"}
          </Button>
        )}
      </div>
      <StickyActions>
        <ValidationMessage id={errorId} message={error} />
        <Button
          className="w-full"
          aria-busy={busy}
          onClick={async () => {
            if (busy) return;
            const message = q.validate(state);
            if (message) return setError(message);
            setBusy(true);
            const failure = await onNext();
            setBusy(false);
            if (failure) setError(failure);
          }}
        >
          {busy && <Spinner aria-hidden />}
          {q.submitLabel ?? "Continue"}
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}

export function TextScreen({ question: q, state, onChange, onNext, headingRef }: ScreenProps<TextQuestion>) {
  const headingId = useId();
  const subId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const value = q.get(state);
  const sub = q.sub?.(state);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Put the caret at the end of anything already typed.
    const end = input.value.length;
    try {
      input.setSelectionRange(end, end);
    } catch {
      // email inputs don't support selection ranges
    }
  }, []);

  const submit = () => {
    const message = q.validate?.(value, state) ?? null;
    if (message) setError(message);
    else onNext();
  };

  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} id={headingId} subId={subId} title={q.title?.(state)} sub={sub} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="contents"
      >
        <Input
          ref={inputRef}
          type={q.inputType ?? "text"}
          inputMode={q.inputType === "email" ? "email" : undefined}
          autoCapitalize={q.inputType === "email" ? "off" : "words"}
          autoCorrect={q.inputType === "email" ? "off" : undefined}
          spellCheck={q.inputType === "email" ? false : undefined}
          enterKeyHint="next"
          autoComplete={q.autoComplete ?? "off"}
          placeholder={q.placeholder ?? "Type here"}
          value={value}
          aria-labelledby={headingId}
          aria-describedby={[sub ? subId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            onChange(q.set(state, e.target.value));
            setError(null);
          }}
        />
        <StickyActions>
          <ValidationMessage id={errorId} message={error} />
          <Button type="submit" className="w-full">
            {q.optional && !value.trim() ? "Skip" : "Continue"}
          </Button>
        </StickyActions>
      </form>
    </ScreenBody>
  );
}

export function StopScreen({ onChangeAge, headingRef }: { onChangeAge: () => void; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <ScreenBody>
      <QuestionHeading
        ref={headingRef}
        title="Stories are open to people aged 14 and over"
        sub="A teacher, parent or carer can share your experience for you. Thanks for wanting to take part."
      />
      <StickyActions>
        <Button className="w-full" onClick={onChangeAge}>
          Change my age
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
