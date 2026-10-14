import { firstName, type FlowState } from "./state";

/**
 * The text a draft is written from (docs/ai-prompts.md section 2): the interview as
 * "Interviewer:" and first-name lines, the written story, or the media transcript.
 */
export function sourceText(s: FlowState): string {
  if (s.format === "interview") {
    const name = firstName(s) || "Student";
    return s.turns.map((t) => `${t.role === "assistant" ? "Interviewer" : name}: ${t.content}`).join("\n");
  }
  if (s.format === "write") return s.written;
  return s.transcript;
}

/** Only the person's own words, for picking quotes when drafting falls back. */
export function ownWords(s: FlowState): string {
  if (s.format === "interview") {
    return s.turns
      .filter((t) => t.role === "user" && !t.quickReply)
      .map((t) => t.content)
      .join("\n\n");
  }
  return s.format === "write" ? s.written : s.transcript;
}
