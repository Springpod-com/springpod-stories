// The question config that drives the public flow (PRD 5.3).
// Adding, removing or reordering a question is a change to this file only.
// Copy is the prototype copy as written.

import {
  AGES,
  CHANNELS,
  EXPERIENCE_TYPES,
  FIRST_JOB,
  INDUSTRIES,
  NOW_OPTIONS,
  SPRINGPOD_PROGRAMME,
  WHO,
  type Channel,
  type DisplayChoice,
  type StoryFormat,
} from "./options";
import { firstName, isEmail, isMinor, isUnder14, isWorking, usesMedia, type FlowState } from "./state";

export type ChapterId = "about" | "experience" | "story" | "sharing";

export const CHAPTERS: { id: ChapterId; name: string }[] = [
  { id: "about", name: "About you" },
  { id: "experience", name: "Experience" },
  { id: "story", name: "Your story" },
  { id: "sharing", name: "Sharing" },
];

export type IconKey = "chat" | "pen" | "mic" | "video";

export interface Option {
  value: string;
  label: string;
  description?: string;
  icon?: IconKey;
}

interface BaseQuestion {
  id: string;
  /** Not set for the start, stop and done screens, which sit outside the four chapters. */
  chapter?: ChapterId;
  /** Show condition. Omitted means always shown. */
  when?: (s: FlowState) => boolean;
  title?: (s: FlowState) => string;
  sub?: (s: FlowState) => string | undefined;
}

export interface SingleQuestion extends BaseQuestion {
  kind: "single";
  layout?: "list" | "grid" | "grid-compact";
  /** Shows the quote card above the answers. */
  preview?: boolean;
  options: (s: FlowState) => Option[];
  get: (s: FlowState) => string;
  set: (s: FlowState, value: string) => FlowState;
}

export interface TextQuestion extends BaseQuestion {
  kind: "text";
  inputType?: "text" | "email";
  optional?: boolean;
  placeholder?: string;
  autoComplete?: string;
  get: (s: FlowState) => string;
  set: (s: FlowState, value: string) => FlowState;
  /** Returns the error message, or null when valid. */
  validate?: (value: string, s: FlowState) => string | null;
}

export interface MultiQuestion extends BaseQuestion {
  kind: "multi" | "confirm";
  options: (s: FlowState) => Option[];
  get: (s: FlowState) => string[];
  set: (s: FlowState, values: string[]) => FlowState;
  validate: (s: FlowState) => string | null;
  selectAll?: boolean;
  submitLabel?: string;
}

export interface ScreenQuestion extends BaseQuestion {
  kind: "intro" | "stop" | "guide" | "story" | "transcript" | "draft" | "done";
}

export type Question = SingleQuestion | TextQuestion | MultiQuestion | ScreenQuestion;

const required = (message: string) => (v: string) => (v.trim() ? null : message);
const BAD_EMAIL = "That email doesn't look right. Check it and try again";

export const QUESTIONS: Question[] = [
  { id: "intro", kind: "intro" },
  {
    id: "who",
    kind: "single",
    chapter: "about",
    title: () => "Which best describes you?",
    options: () => WHO,
    get: (s) => s.who,
    set: (s, v) => {
      const who = v as FlowState["who"];
      const autoSet = s.expType === SPRINGPOD_PROGRAMME || (s.who === "pro" && s.expType === FIRST_JOB);
      let expType = autoSet ? "" : s.expType;
      if (who === "springpod") expType = SPRINGPOD_PROGRAMME;
      if (who === "pro") expType = FIRST_JOB;
      return { ...s, who, expType };
    },
  },
  {
    id: "age",
    kind: "single",
    chapter: "about",
    layout: "grid",
    title: () => "How old are you?",
    sub: () => "So we can follow the right consent rules.",
    options: () => AGES.map((a) => ({ value: a, label: a })),
    get: (s) => s.age,
    set: (s, v) => ({ ...s, age: v as FlowState["age"] }),
  },
  { id: "stop", kind: "stop", when: isUnder14 },
  {
    id: "name",
    kind: "text",
    chapter: "about",
    title: () => "What's your first name?",
    sub: () => "Just your first name. We never publish surnames.",
    autoComplete: "given-name",
    get: (s) => s.firstName,
    set: (s, v) => ({ ...s, firstName: v }),
    validate: required("Add your first name"),
  },
  {
    id: "exp",
    kind: "single",
    chapter: "experience",
    when: (s) => s.who !== "springpod" && s.who !== "pro",
    title: (s) => `Nice to meet you, ${firstName(s)}. What kind of experience was it?`,
    options: () => EXPERIENCE_TYPES.map((x) => ({ value: x, label: x })),
    get: (s) => s.expType,
    set: (s, v) => ({ ...s, expType: v }),
  },
  {
    id: "role",
    kind: "text",
    chapter: "experience",
    title: (s) =>
      s.who === "pro"
        ? `What field was your first job in, ${firstName(s)}?`
        : `What area or job was it in${s.who === "springpod" ? `, ${firstName(s)}` : ""}?`,
    sub: () => "For example engineering, nursing, marketing, retail.",
    get: (s) => s.role,
    set: (s, v) => ({ ...s, role: v }),
    validate: required("Add the area or job"),
  },
  {
    id: "org",
    kind: "text",
    chapter: "experience",
    optional: true,
    title: () => "Which organisation was it with?",
    sub: () => "Optional. If you name them, we may ask them to review your story before it goes on their pages.",
    placeholder: "e.g. Rolls-Royce, a local vet",
    get: (s) => s.org,
    set: (s, v) => ({ ...s, org: v }),
  },
  {
    id: "now",
    kind: "single",
    chapter: "experience",
    title: () => "What are you doing now?",
    sub: () => "Students love seeing where work experience leads.",
    options: () => NOW_OPTIONS,
    get: (s) => s.nowStatus,
    set: (s, v) => {
      const next = { ...s, nowStatus: v as FlowState["nowStatus"] };
      return isWorking(next) ? next : { ...next, nowRole: "", nowCo: "", nowInd: "", showCo: null };
    },
  },
  {
    id: "nowRole",
    kind: "text",
    chapter: "experience",
    when: isWorking,
    title: (s) => (s.nowStatus === "apprentice" ? "What's your apprenticeship?" : "What's your current role?"),
    sub: () => "Your job title is fine.",
    placeholder: "e.g. Junior Photographer",
    get: (s) => s.nowRole,
    set: (s, v) => ({ ...s, nowRole: v }),
    validate: required("Add your role"),
  },
  {
    id: "nowCo",
    kind: "text",
    chapter: "experience",
    optional: true,
    when: isWorking,
    title: () => "Where do you work?",
    sub: () => "Optional. We'll only show it if you say so on the last step.",
    placeholder: "Company name",
    get: (s) => s.nowCo,
    set: (s, v) => ({ ...s, nowCo: v, showCo: v.trim() ? s.showCo : null }),
  },
  {
    id: "nowInd",
    kind: "single",
    chapter: "experience",
    layout: "grid-compact",
    when: isWorking,
    title: () => "Which industry is that in?",
    options: () => INDUSTRIES.map((x) => ({ value: x, label: x })),
    get: (s) => s.nowInd,
    set: (s, v) => ({ ...s, nowInd: v }),
  },
  {
    id: "mode",
    kind: "single",
    chapter: "story",
    title: () => "How do you want to tell your story?",
    options: () => [
      {
        value: "interview",
        label: "Interview me",
        description: "We ask a few questions and write it up for you. About 5 minutes.",
        icon: "chat",
      },
      { value: "self", label: "Tell it myself", description: "Record a voice note, film a video or write it down.", icon: "pen" },
    ],
    get: (s) => s.mode,
    set: (s, v) => {
      const mode = v as FlowState["mode"];
      if (mode === "interview") return { ...s, mode, format: "interview", mediaId: "", transcript: "" };
      return { ...s, mode, format: s.format === "interview" ? "" : s.format };
    },
  },
  {
    id: "format",
    kind: "single",
    chapter: "story",
    when: (s) => s.mode === "self",
    title: () => "How would you like to tell it?",
    options: () => [
      { value: "voice", label: "Voice note", description: "Talk for up to 3 minutes. We transcribe it.", icon: "mic" },
      { value: "video", label: "Video", description: "Up to 90 seconds. Best for social media.", icon: "video" },
      { value: "write", label: "Write it", description: "Type it, with prompts if you get stuck.", icon: "pen" },
    ],
    get: (s) => s.format,
    set: (s, v) => {
      const format = v as StoryFormat;
      return format === s.format ? s : { ...s, format, mediaId: "", transcript: "", draft: null };
    },
  },
  { id: "guide", kind: "guide", chapter: "story", when: usesMedia },
  { id: "story", kind: "story", chapter: "story" },
  { id: "transcript", kind: "transcript", chapter: "story", when: usesMedia },
  { id: "draft", kind: "draft", chapter: "story" },
  {
    id: "display",
    kind: "single",
    chapter: "sharing",
    preview: true,
    title: () => "How should your name appear?",
    sub: () => "Here's how your quote could look.",
    options: (s) => [
      { value: "first", label: `First name (${firstName(s)})` },
      { value: "initial", label: `First initial (${firstName(s).charAt(0).toUpperCase()}.)` },
      { value: "anon", label: "No name" },
    ],
    get: (s) => s.display,
    set: (s, v) => ({ ...s, display: v as DisplayChoice }),
  },
  {
    id: "showCo",
    kind: "single",
    chapter: "sharing",
    preview: true,
    when: (s) => isWorking(s) && !!s.nowCo.trim(),
    title: (s) => `Can we say you work at ${s.nowCo.trim()}?`,
    sub: () => "It helps other students see where this path leads.",
    options: () => [
      { value: "yes", label: "Yes, show it" },
      { value: "no", label: "No, just my role" },
    ],
    get: (s) => (s.showCo === true ? "yes" : s.showCo === false ? "no" : ""),
    set: (s, v) => ({ ...s, showCo: v === "yes" }),
  },
  {
    id: "channels",
    kind: "multi",
    chapter: "sharing",
    selectAll: true,
    title: () => "Where can we share it?",
    sub: () => "Choose as many as you like.",
    options: () => CHANNELS,
    get: (s) => CHANNELS.filter((c) => s.channels[c.value]).map((c) => c.value),
    set: (s, values) => ({
      ...s,
      channels: Object.fromEntries(CHANNELS.map((c) => [c.value, values.includes(c.value)])) as Record<Channel, boolean>,
    }),
    validate: (s) => (Object.values(s.channels).some(Boolean) ? null : "Choose at least one"),
  },
  {
    id: "email",
    kind: "text",
    chapter: "sharing",
    inputType: "email",
    title: () => "What's your email?",
    sub: () => "To confirm it's you and tell you when your story is live. No password.",
    placeholder: "name@example.com",
    autoComplete: "email",
    get: (s) => s.email,
    set: (s, v) => ({ ...s, email: v }),
    validate: (v) => (isEmail(v) ? null : BAD_EMAIL),
  },
  {
    id: "parent",
    kind: "text",
    chapter: "sharing",
    inputType: "email",
    when: isMinor,
    title: () => "What's your parent or carer's email?",
    sub: () => "We'll ask them to agree. Your story stays private until they do.",
    placeholder: "name@example.com",
    get: (s) => s.parentEmail,
    set: (s, v) => ({ ...s, parentEmail: v }),
    validate: (v, s) =>
      !isEmail(v)
        ? BAD_EMAIL
        : v.trim().toLowerCase() === s.email.trim().toLowerCase()
          ? "This needs to be a different email from yours"
          : null,
  },
  {
    id: "confirm",
    kind: "confirm",
    chapter: "sharing",
    title: () => "Almost done. Please confirm.",
    submitLabel: "Send my story",
    options: () => [
      {
        value: "terms",
        label: "This is my own experience",
        description: "Springpod can use it where I've chosen. I can ask for it to be removed at any time.",
      },
      { value: "marketing", label: "Email me early careers opportunities", description: "Optional" },
    ],
    get: (s) => [...(s.terms ? ["terms"] : []), ...(s.marketing ? ["marketing"] : [])],
    set: (s, values) => ({ ...s, terms: values.includes("terms"), marketing: values.includes("marketing") }),
    validate: (s) => (s.terms ? null : "Tick the first box to confirm it's your experience"),
  },
  { id: "done", kind: "done" },
];
