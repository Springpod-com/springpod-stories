import type { FlowState } from "./state";

/**
 * MILESTONE 1 PLACEHOLDER: stands in for the interview, written story and media
 * transcript until capture is built (milestones 3 and 4). Text from the prototype.
 */
export function sampleStoryText(s: FlowState): string {
  return `So I did my ${s.expType.toLowerCase()}${s.org ? ` at ${s.org}` : ""} in ${s.role || "the team"}. The first day I was honestly really nervous, I didn't know what to wear or who to talk to. But they gave me a proper task straight away, I had to help put together a short report for the team, and by Wednesday I was presenting part of it in their morning meeting. That was the bit that stuck with me, someone actually used what I made. The hardest thing was asking questions, I thought I'd look stupid, but everyone said that's how you learn. I got better at explaining things clearly and managing my time. My advice would be just say yes to things and ask loads of questions.`;
}
