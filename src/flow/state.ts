import type { AgeOption, Channel, DisplayChoice, NowStatus, StoryFormat, StoryMode, Who } from "./options";

/** One message in the AI interview. */
export interface Turn {
  role: "assistant" | "user";
  content: string;
  /** "Ask it differently" or "Skip this one": not counted as an answer. */
  quickReply?: boolean;
}

export interface Draft {
  headline: string;
  story: string;
  pullQuote: string;
  quoteOptions: string[];
  skills: string[];
  advice: string;
  sector: string;
}

/** Everything the public flow collects. Held in the browser; saved to the server from milestone 2. */
export interface FlowState {
  who: Who | "";
  age: AgeOption | "";
  firstName: string;
  expType: string;
  role: string;
  org: string;
  nowStatus: NowStatus | "";
  nowRole: string;
  nowCo: string;
  nowInd: string;
  mode: StoryMode | "";
  format: StoryFormat | "";
  written: string;
  /** The voice note or video chosen with "Use this video". Uploaded and processed on the server. */
  mediaId: string;
  /** The transcript as the person has corrected it. */
  transcript: string;
  /** The AI interview so far. Stored on the server turn by turn, not by autosave. */
  turns: Turn[];
  interviewEnded: boolean;
  draft: Draft | null;
  display: DisplayChoice | "";
  showCo: boolean | null;
  channels: Record<Channel, boolean>;
  email: string;
  parentEmail: string;
  terms: boolean;
  marketing: boolean;
}

export const initialState: FlowState = {
  who: "",
  age: "",
  firstName: "",
  expType: "",
  role: "",
  org: "",
  nowStatus: "",
  nowRole: "",
  nowCo: "",
  nowInd: "",
  mode: "",
  format: "",
  written: "",
  mediaId: "",
  transcript: "",
  turns: [],
  interviewEnded: false,
  draft: null,
  display: "",
  showCo: null,
  channels: { platform: false, website: false, blog: false, social: false },
  email: "",
  parentEmail: "",
  terms: false,
  marketing: false,
};

/** "Share another story" keeps who they are and their contact details, and clears the story. */
export function resetForAnotherStory(state: FlowState): FlowState {
  return {
    ...initialState,
    who: state.who,
    age: state.age,
    firstName: state.firstName,
    email: state.email,
    parentEmail: state.parentEmail,
    display: state.display,
  };
}

export const isWorking = (s: FlowState) => s.nowStatus === "working" || s.nowStatus === "apprentice";
export const isMinor = (s: FlowState) => s.age === "14 to 17";
export const isUnder14 = (s: FlowState) => s.age === "Under 14";
export const usesMedia = (s: FlowState) => s.format === "voice" || s.format === "video";
export const firstName = (s: FlowState) => s.firstName.trim().split(/\s+/)[0] ?? "";
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const wordCount = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

/** Interview answers that count towards the minimum: quick replies don't. */
export const interviewAnswers = (s: FlowState) => s.turns.filter((t) => t.role === "user" && !t.quickReply).length;

/** Minimum written words (PRD 6.2) and interview answers (PRD 6.1) before the story can be written up. */
export const MIN_WRITTEN_WORDS = 40;
export const MIN_INTERVIEW_ANSWERS = 3;
/** Minimum transcript words before a voice note or video can be written up (prototype). */
export const MIN_TRANSCRIPT_WORDS = 20;
