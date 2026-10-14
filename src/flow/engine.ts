// Pure functions over the question config. No React, no browser APIs.

import { CHAPTERS, type ChapterId, type Question } from "./questions";
import type { FlowState } from "./state";

export const isVisible = (q: Question, s: FlowState) => !q.when || q.when(s);

export function visibleQuestions(questions: Question[], s: FlowState): Question[] {
  return questions.filter((q) => isVisible(q, s));
}

export function findQuestion(questions: Question[], id: string): Question {
  const q = questions.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question id: ${id}`);
  return q;
}

/** The next visible question after `id`, or `id` itself at the end. */
export function nextId(questions: Question[], id: string, s: FlowState): string {
  const from = questions.findIndex((q) => q.id === id);
  for (let i = from + 1; i < questions.length; i++) {
    const q = questions[i]!;
    if (isVisible(q, s)) return q.id;
  }
  return id;
}

/** The previous visible question before `id`. The stop screen is never a back target. */
export function prevId(questions: Question[], id: string, s: FlowState): string {
  const from = questions.findIndex((q) => q.id === id);
  for (let i = from - 1; i >= 0; i--) {
    const q = questions[i]!;
    if (isVisible(q, s) && q.kind !== "stop") return q.id;
  }
  return id;
}

/** Error message for the current answer, or null if the question can be left. */
export function validationError(q: Question, s: FlowState): string | null {
  switch (q.kind) {
    case "single":
      return q.get(s) ? null : "Choose an option";
    case "text":
      return q.validate ? q.validate(q.get(s), s) : null;
    case "multi":
    case "confirm":
      return q.validate(s);
    case "stop":
      return "stop";
    case "draft":
      return s.draft ? null : "draft";
    default:
      return null;
  }
}

/**
 * Where someone may land when they open a step directly (history, reload, deep link):
 * the requested step if every visible step before it is complete, otherwise the
 * first incomplete one.
 */
export function reachableId(questions: Question[], requested: string, s: FlowState): string {
  const target = questions.find((q) => q.id === requested);
  if (!target || !isVisible(target, s)) return firstIncompleteId(questions, s);
  for (const q of visibleQuestions(questions, s)) {
    if (q.id === requested) return requested;
    if (validationError(q, s)) return q.id;
  }
  return requested;
}

function firstIncompleteId(questions: Question[], s: FlowState): string {
  for (const q of visibleQuestions(questions, s)) {
    if (validationError(q, s)) return q.id;
  }
  return questions[0]!.id;
}

export interface ChapterProgress {
  id: ChapterId;
  name: string;
  /** 0 to 100 */
  fill: number;
}

/** Fill for each of the four chapter bars, counting only the questions currently shown. */
export function chapterProgress(questions: Question[], id: string, s: FlowState): ChapterProgress[] {
  const current = findQuestion(questions, id);
  const currentIndex = CHAPTERS.findIndex((c) => c.id === current.chapter);
  return CHAPTERS.map((c, i) => {
    let fill = 0;
    if (currentIndex >= 0 && i < currentIndex) fill = 100;
    if (i === currentIndex) {
      const ids = visibleQuestions(questions, s)
        .filter((q) => q.chapter === c.id)
        .map((q) => q.id);
      fill = Math.round(((ids.indexOf(id) + 1) / ids.length) * 100);
    }
    return { id: c.id, name: c.name, fill };
  });
}

export function chapterName(questions: Question[], id: string): string | undefined {
  const chapter = findQuestion(questions, id).chapter;
  return CHAPTERS.find((c) => c.id === chapter)?.name;
}
