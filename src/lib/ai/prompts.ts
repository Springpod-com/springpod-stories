// Every AI prompt in one module (docs/ai-prompts.md). The text is copied from that document;
// change both together and bump PROMPT_VERSION, which is stored on each story.

export const PROMPT_VERSION = "2026-10-14.2";

/** Who the story is about, shared by the interviewer and the draft prompts. */
export interface PersonContext {
  firstName: string;
  /** "14 to 17", "18 to 24" or "25 or over" */
  ageBand: string;
  expType: string;
  organisation: string;
  area: string;
  whoLabel: string;
  nowText: string;
}

/** Interviewer system prompt (docs/ai-prompts.md section 1). */
export function interviewerSystem(c: PersonContext): string {
  const at = c.organisation ? ` at ${c.organisation}` : "";
  return `You are the interviewer for Springpod Work Experience Stories, a UK early careers platform collecting real work experience stories for its website, blog and social channels.
You are interviewing ${c.firstName}, aged ${c.ageBand}, about their ${c.expType}${at}, in ${c.area}. They describe themselves as: ${c.whoLabel}. What they do now: ${c.nowText}. If it fits naturally, ask one question near the end about how the experience led to what they do now.
Your job: draw out a vivid, specific, first-person story.
Rules:
- Ask ONE short question at a time, 25 words or fewer. Warm, plain British English. No emojis, no em dashes, no jargon, no gushing praise.
- Cover these in a natural order: what they did day to day; one specific moment that stood out; something hard or surprising; a skill they used or built (with an example); how it changed their view of their future; advice for someone like them.
- If an answer is vague or one line, ask one follow-up for a concrete example before moving on. Briefly acknowledge what they said (a few words) before the next question.
- Never ask for surnames, school names, addresses, phone numbers, social handles or contact details. If they share any, do not repeat it.
- If they describe anything that suggests they were unsafe, harmed or treated badly, respond kindly, suggest they talk to a trusted adult or the organiser, and end the interview with [[SAFEGUARDING]].
- After 6 to 8 questions, or once you have enough for a strong story, thank them in one sentence and end your message with [[END]].
Reply with only your next message to ${c.firstName}.`;
}

/** First user turn that starts the interview. */
export const INTERVIEW_KICKOFF = "Start the interview now with a short hello and your first question.";

export const END_MARKER = "[[END]]";
export const SAFEGUARDING_MARKER = "[[SAFEGUARDING]]";

/** Hard stop after this many user answers (docs/ai-prompts.md section 1). */
export const MAX_USER_ANSWERS = 9;

/** Fixed messages sent by the quick reply buttons. */
export const QUICK_REPLIES = {
  differently: "Could you ask that a different way?",
  skip: "I'd rather skip that one.",
} as const;

/** Questions used when the AI call fails (docs/ai-prompts.md section 1). */
export function fallbackQuestions(firstName: string, expType: string): string[] {
  return [
    `Hi ${firstName}! What did a normal day look like during your ${expType.toLowerCase()}?`,
    "Was there one moment that really stood out? Talk me through what happened.",
    "What was harder or different from what you expected?",
    "What's one skill you used or got better at? Give me an example of when.",
    "Has it changed what you think about your future, or what you want to do next?",
    "Last one. What advice would you give someone about to do the same thing?",
  ];
}

/** Closing message once the fallback questions run out, or at the hard stop (prototype copy). */
export const fallbackClosing = (firstName: string) => `Thanks ${firstName}, that's brilliant. I've got everything I need.`;

/** The draft prompt reads at most this much source text (docs/ai-prompts.md section 2). */
export const MAX_SOURCE_CHARS = 12_000;

/** Story draft prompt (docs/ai-prompts.md section 2). `previousHeadline` asks for a different angle. */
export function draftPrompt(c: PersonContext, source: string, previousHeadline?: string | null): string {
  const at = c.organisation ? ` at ${c.organisation}` : "";
  const different = previousHeadline
    ? ` Take a noticeably different angle and opening from this previous version: ${previousHeadline}`
    : "";
  return `Turn this into a short first-person work experience story for Springpod Work Experience Stories, to be published on Springpod's website and blog.
About the person: ${c.firstName}, ${c.ageBand}, ${c.whoLabel}. Experience: ${c.expType}${at}, ${c.area}. What they do now: ${c.nowText}. If they say how the experience shaped what they do now, end the story on that link.
Rules: write in their voice using their own words and details where possible; do not invent facts, names or numbers; British English; plain and honest, not salesy; no em dashes; no emojis; remove any surnames, school names or contact details; 180 to 280 words in 3 or 4 short paragraphs.${different}
Reply with only JSON: {"headline": string (max 10 words, specific, not clickbait), "story": string (paragraphs separated by \\n\\n), "quoteOptions": [3 different strings, each 8 to 20 words, close to their own words, each about a specific moment, feeling, surprise or lesson. Never a summary of what, where or when (no "I did X work experience in year 10"). Pick lines a student would stop scrolling for], "pullQuote": string (the strongest of quoteOptions), "skills": [up to 4 short skill names], "advice": string (one sentence, their advice), "sector": string}

Source:
${source.slice(0, MAX_SOURCE_CHARS)}`;
}
