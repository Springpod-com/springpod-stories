// One interview turn (PRD 6.1, docs/ai-prompts.md section 1), independent of the database and the SDK
// so it can be tested with a fake model.

import {
  END_MARKER,
  fallbackClosing,
  fallbackQuestions,
  INTERVIEW_KICKOFF,
  interviewerSystem,
  MAX_USER_ANSWERS,
  SAFEGUARDING_MARKER,
  type PersonContext,
} from "./prompts";

export interface Turn {
  role: "assistant" | "user";
  content: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Streams the model's text. Throws if the call fails or the model declines. */
export type Generate = (request: { system: string; messages: ChatMessage[] }) => AsyncIterable<string>;

export type InterviewEvent =
  | { type: "delta"; text: string }
  /** Discard anything shown so far for this turn and show this instead (used when a stream fails part way). */
  | { type: "replace"; text: string }
  | { type: "done"; text: string; ended: boolean; safeguarding: boolean; fallback: boolean };

const MARKERS = [END_MARKER, SAFEGUARDING_MARKER];

/**
 * Removes the end and safeguarding markers from streamed text. A marker can arrive split
 * across chunks, so any tail that could be the start of one is held back until it is clear.
 */
export class MarkerFilter {
  private held = "";
  ended = false;
  safeguarding = false;

  push(chunk: string): string {
    let text = this.held + chunk;
    for (const marker of MARKERS) {
      if (text.includes(marker)) {
        if (marker === END_MARKER) this.ended = true;
        else this.safeguarding = true;
        text = text.split(marker).join("");
      }
    }
    const hold = this.partialMarkerLength(text);
    this.held = text.slice(text.length - hold);
    return text.slice(0, text.length - hold);
  }

  /** Whatever is left once the stream ends. */
  flush(): string {
    const rest = this.held;
    this.held = "";
    return rest;
  }

  private partialMarkerLength(text: string): number {
    for (let n = Math.min(text.length, Math.max(...MARKERS.map((m) => m.length)) - 1); n > 0; n--) {
      const tail = text.slice(text.length - n);
      if (MARKERS.some((m) => m.startsWith(tail))) return n;
    }
    return 0;
  }
}

/**
 * Runs one turn: the model's next message, or a fixed fallback question if the model is
 * unavailable, fails or declines. `history` holds the turns so far, including the user's
 * newest answer. Yields the text as it streams, then a final "done" event.
 */
export async function* interviewTurn({
  context,
  history,
  generate,
}: {
  context: PersonContext;
  history: Turn[];
  generate: Generate | null;
}): AsyncGenerator<InterviewEvent> {
  const answers = history.filter((t) => t.role === "user").length;

  const fallback = (): InterviewEvent & { type: "done" } => {
    const next = fallbackQuestions(context.firstName, context.expType)[answers];
    return next
      ? { type: "done", text: next, ended: false, safeguarding: false, fallback: true }
      : { type: "done", text: fallbackClosing(context.firstName), ended: true, safeguarding: false, fallback: true };
  };

  // Hard stop: no more model calls after the maximum number of answers.
  if (answers >= MAX_USER_ANSWERS) {
    const text = fallbackClosing(context.firstName);
    yield { type: "delta", text };
    yield { type: "done", text, ended: true, safeguarding: false, fallback: true };
    return;
  }

  if (!generate) {
    const done = fallback();
    yield { type: "delta", text: done.text };
    yield done;
    return;
  }

  const filter = new MarkerFilter();
  let shown = "";
  try {
    const stream = generate({
      system: interviewerSystem(context),
      messages: [{ role: "user", content: INTERVIEW_KICKOFF }, ...history],
    });
    for await (const chunk of stream) {
      const text = filter.push(chunk);
      if (text) {
        shown += text;
        yield { type: "delta", text };
      }
    }
    const rest = filter.flush();
    if (rest) {
      shown += rest;
      yield { type: "delta", text: rest };
    }
  } catch {
    const done = fallback();
    yield { type: "replace", text: done.text };
    yield done;
    return;
  }

  const text = shown.trim();
  if (!text) {
    const done = fallback();
    yield { type: "replace", text: done.text };
    yield done;
    return;
  }
  yield {
    type: "done",
    text,
    ended: filter.ended || filter.safeguarding,
    safeguarding: filter.safeguarding,
    fallback: false,
  };
}
