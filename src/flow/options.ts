// Answer options for the public flow. Copy is taken from the prototype as written.

export type Who = "springpod" | "student" | "early" | "pro";
export type AgeOption = "Under 14" | "14 to 17" | "18 to 24" | "25 or over";
export type NowStatus = "school" | "college" | "uni" | "apprentice" | "working" | "other";
export type StoryMode = "interview" | "self";
export type StoryFormat = "interview" | "write" | "voice" | "video";
export type DisplayChoice = "first" | "initial" | "anon";
export type Channel = "platform" | "website" | "blog" | "social";

export const WHO: { value: Who; label: string; description: string }[] = [
  { value: "springpod", label: "Springpod student", description: "I did a programme on Springpod" },
  { value: "student", label: "Student", description: "School, college or uni work experience" },
  { value: "early", label: "Apprentice or early career", description: "My first job or apprenticeship" },
  { value: "pro", label: "Working professional", description: "My first job story" },
];

export const AGES: AgeOption[] = ["Under 14", "14 to 17", "18 to 24", "25 or over"];

export const SPRINGPOD_PROGRAMME = "Springpod virtual programme";
export const FIRST_JOB = "My first job";

/** Experience types offered on the "What kind of experience was it?" screen. */
export const EXPERIENCE_TYPES = [
  "School work experience week",
  "Internship",
  "Apprenticeship",
  "Part-time or Saturday job",
  "Volunteering",
  "Insight day or event",
  FIRST_JOB,
];

export const NOW_OPTIONS: { value: NowStatus; label: string }[] = [
  { value: "school", label: "At school" },
  { value: "college", label: "At college or sixth form" },
  { value: "uni", label: "At university" },
  { value: "apprentice", label: "On an apprenticeship" },
  { value: "working", label: "Working" },
  { value: "other", label: "Something else" },
];

/**
 * PLACEHOLDER (PRD section 21): industry list to be replaced with Springpod's
 * sector taxonomy if one exists. These are the prototype's 11 options.
 */
export const INDUSTRIES = [
  "Arts and media",
  "Business and finance",
  "Construction and engineering",
  "Education",
  "Health and social care",
  "Hospitality and retail",
  "Law",
  "Public sector and defence",
  "Science and pharma",
  "Technology",
  "Other",
];

export const CHANNELS: { value: Channel; label: string; description: string }[] = [
  { value: "platform", label: "On Springpod", description: "Shown to students exploring similar experiences" },
  { value: "website", label: "On springpod.com", description: "Programme and careers pages" },
  { value: "blog", label: "On our blog", description: "Possibly within a longer article" },
  { value: "social", label: "On social media", description: "LinkedIn, Instagram, TikTok, with your quote on a graphic" },
];

export const FORMAT_NAME: Record<StoryFormat, string> = {
  interview: "Interview",
  write: "Written",
  voice: "Voice note",
  video: "Video",
};
