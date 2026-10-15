// Example stories for the start screen reel. Stock portraits (design/assets/CREDITS.md) and
// invented names and quotes, always shown under the "Example stories" tag.
// PLACEHOLDER (PRD section 21): replace with real, approved, consented stories.

export type ExampleKind = "video" | "voice" | "written";

export interface ExampleStory {
  kind: ExampleKind;
  portrait: string;
  name: string;
  meta: string;
  quote: string;
  duration?: string;
}

export const EXAMPLES: ExampleStory[] = [
  {
    kind: "video",
    portrait: "/examples/1-amara.jpg",
    name: "Amara",
    meta: "Vet practice · age 16",
    quote: "By Thursday the nurses had me calming the animals before their injections.",
    duration: "0:42",
  },
  {
    kind: "voice",
    portrait: "/examples/2-leo.jpg",
    name: "Leo",
    meta: "Software internship · now Junior Developer",
    quote: "My code went live on day four. People are using a button I built.",
    duration: "1:12",
  },
  {
    kind: "written",
    portrait: "/examples/3-karim.jpg",
    name: "Karim",
    meta: "Engineering apprenticeship taster",
    quote: "I took apart a jet engine part I'd only ever seen in videos. That was the moment I knew.",
  },
  {
    kind: "video",
    portrait: "/examples/4-tom.jpg",
    name: "Tom",
    meta: "My first job · now Site Manager",
    quote: "Nobody expected the work experience kid to spot the measuring mistake. I did.",
    duration: "0:58",
  },
  {
    kind: "voice",
    portrait: "/examples/5-ella.jpg",
    name: "Ella",
    meta: "Hospital ward · age 15",
    quote: "I was terrified of saying the wrong thing. A patient told me I made her day.",
    duration: "0:47",
  },
  {
    kind: "written",
    portrait: "/examples/6-mia.jpg",
    name: "Mia",
    meta: "Marketing internship · now at university",
    quote: "They used my idea in a real campaign. I still screenshot it when I need a boost.",
  },
];

/** Advance every 3.6 seconds (PRD 5.2). */
export const REEL_INTERVAL_MS = 3600;
