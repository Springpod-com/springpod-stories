// Demo data for reviewers: pnpm demo:seed
// Sends invented stories (example.com addresses) through the real submit, confirm, pre-screen,
// parent and review steps, so the admin has one story in each state the team will meet.
// Never for production: it only runs against a localhost APP_URL, or with DEMO_DATA_OK=1 on a
// staging database. Running it again only adds the demo stories that aren't there yet.
import "dotenv/config";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialState, type FlowState } from "@/flow/state";
import type { PrescreenOutput } from "@/lib/ai/prescreen";
import { generateContentPack } from "@/lib/server/content-pack";
import { db } from "@/lib/server/db";
import { runPrescreen } from "@/lib/server/prescreen";
import { approve, reject, requestChanges } from "@/lib/server/review";
import { confirmStoryEmail, submitStory } from "@/lib/server/stories";
import type { Staff } from "@/lib/staff";
import { pickDraftAnswers } from "@/lib/story-data";

const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.APP_URL ?? "");
if (!local && process.env.DEMO_DATA_OK !== "1") {
  console.error("Demo data only goes into a local stack (APP_URL on localhost), or a staging one with DEMO_DATA_OK=1.");
  process.exit(1);
}
const DOMAIN = "@demo.example.com";

// Emails go to a scratch folder so the script can follow the links in them, as people would.
const outbox = mkdtempSync(join(tmpdir(), "wes-demo-"));
process.env.EMAIL_OUTBOX_DIR = outbox;
const linkIn = (template: string, to: string, path: string): string => {
  for (const file of readdirSync(outbox).filter((f) => f.endsWith(`${template}.json`)).sort().reverse()) {
    const message = JSON.parse(readFileSync(join(outbox, file), "utf8")) as { to: string; text: string };
    if (message.to === to) return new RegExp(`/${path}/([\\w-]+)`).exec(message.text)![1]!;
  }
  throw new Error(`No ${template} email to ${to}`);
};

async function staffMember(email: string, role: "moderator" | "content", name: string): Promise<Staff> {
  const s = await db.staffUser.upsert({ where: { email }, create: { email, role, name }, update: { role, name, active: true } });
  return { id: s.id, email: s.email, name: s.name, role: s.role };
}
const moderator = await staffMember("demo.moderator@springpod.com", "moderator", "Demo Moderator");
const content = await staffMember("demo.content@springpod.com", "content", "Demo Content");

const CLEAN: PrescreenOutput = {
  personal_data: [],
  named_people: [],
  named_organisations: [],
  negative_about_named_organisation: false,
  safeguarding_concern: false,
  safeguarding_reason: "",
  other_concerns: [],
};

interface Demo {
  name: string;
  age?: FlowState["age"];
  expType: string;
  role: string;
  org?: string;
  headline: string;
  story: string;
  quote: string;
  skills: string[];
  /** What the model would have said; the pattern checks still run on the text. */
  model?: Partial<PrescreenOutput>;
  confirm?: boolean;
  then?: "approve" | "changes" | "reject";
}

const DEMOS: Demo[] = [
  {
    name: "Amara",
    expType: "School work experience week",
    role: "Vet practice",
    headline: "A week at the vet practice",
    story:
      "I spent my work experience week at a small vet practice. On the first day I cleaned kennels and watched consultations. " +
      "By Thursday the nurses had me calming the animals before their injections. The hardest part was seeing an animal that couldn't be helped. " +
      "My advice is to ask if you can watch everything, even the boring bits.",
    quote: "By Thursday the nurses had me calming the animals before their injections.",
    skills: ["Communication", "Resilience"],
  },
  {
    name: "Leo",
    expType: "Internship",
    role: "Software development",
    headline: "My code went live on day four",
    story:
      "I joined a small software team for a summer internship. They gave me a real ticket on my first day, which was scary. " +
      "My code went live on day four and people are now using a button I built. Text me on 07700 900456 if you want tips.",
    quote: "My code went live on day four. People are using a button I built.",
    skills: ["Problem solving", "Teamwork"],
  },
  {
    name: "Mia",
    age: "14 to 17",
    expType: "School work experience week",
    role: "Primary school classroom",
    headline: "Helping out in a Year 2 class",
    story:
      "I helped in a Year 2 classroom for a week. I read with small groups and helped set up the science lesson. " +
      "The children asked me so many questions that I had to learn to say I would find out. It made me want to train as a teacher.",
    quote: "The children asked so many questions that I learned to say I would find out.",
    skills: ["Communication", "Patience"],
  },
  {
    name: "Karim",
    expType: "Part-time or Saturday job",
    role: "Retail",
    headline: "Saturdays on the shop floor",
    story:
      "I worked Saturdays in a clothes shop for most of a year. I learned to handle the till, fold displays and talk to customers who were not always patient. " +
      "Some weeks were hard and I did not always feel safe on the late shift when I was left on my own.",
    quote: "I learned to handle the till and talk to customers.",
    skills: ["Customer service"],
    model: { safeguarding_concern: true, safeguarding_reason: "Mentions not feeling safe at work." },
  },
  {
    name: "Ella",
    expType: "Insight day or event",
    role: "Architecture",
    org: "Northbank Architects",
    headline: "Drawing my first floor plan",
    story:
      "At an insight day with an architecture firm, we were given a real brief for a community centre. " +
      "I drew my first floor plan and an architect walked me through what would and would not work. " +
      "I left knowing that architecture is as much about people as buildings.",
    quote: "I left knowing that architecture is as much about people as buildings.",
    skills: ["Design", "Listening"],
    then: "approve",
  },
  {
    name: "Tom",
    expType: "Apprenticeship",
    role: "Construction site management",
    headline: "Learning the site",
    story:
      "I started an apprenticeship on a building site in September. There were safety briefings every morning and a lot of new words. " +
      "It was a lot to take in at first, but the site manager let me shadow her for the whole first month.",
    quote: "It was a lot to take in.",
    skills: ["Organisation"],
    then: "changes",
  },
  {
    name: "Sam",
    expType: "Volunteering",
    role: "Food bank",
    headline: "Volunteering at the food bank",
    story:
      "I volunteered at a food bank on Saturday mornings. I sorted donations, packed parcels and helped people find what they needed. " +
      "This story was sent twice by mistake, so the team rejects this second copy and keeps the first one.",
    quote: "I volunteered at a food bank.",
    skills: ["Teamwork"],
    then: "reject",
  },
  {
    name: "Priya",
    expType: "Internship",
    role: "Marketing",
    headline: "A summer in marketing",
    story:
      "I interned in a marketing team for six weeks. I helped plan a social campaign and presented the results to the team. " +
      "The best moment was seeing a post I wrote reach thousands of people, and hearing the team say they would use my idea again next year.",
    quote: "The best moment was seeing a post I wrote reach thousands of people, and hearing the team say they would use my idea again next year.",
    skills: ["Writing", "Presenting"],
    confirm: false,
  },
];

const noJobs = async () => undefined;

for (const [i, d] of DEMOS.entries()) {
  const email = `${d.name.toLowerCase()}${DOMAIN}`;
  if (await db.submitter.count({ where: { email } })) {
    console.log(`${d.name.padEnd(6)} already there`);
    continue;
  }
  // The parent or carer is emailed but doesn't answer, so the story waits for them.
  const parentEmail = d.age === "14 to 17" ? `${d.name.toLowerCase()}.parent${DOMAIN}` : "";
  const state: FlowState = {
    ...initialState,
    who: "student",
    age: d.age ?? "18 to 24",
    firstName: d.name,
    expType: d.expType,
    role: d.role,
    org: d.org ?? "",
    nowStatus: d.age === "14 to 17" ? "school" : "uni",
    mode: "self",
    format: "write",
    written: d.story,
    draft: { headline: d.headline, story: d.story, pullQuote: d.quote, quoteOptions: [d.quote], skills: d.skills, advice: "", sector: "" },
    display: "first",
    channels: { platform: true, website: true, blog: false, social: i % 2 === 0 },
    email,
    parentEmail,
    terms: true,
  };
  const sent = await submitStory(`demo-device-${i}`, { ...pickDraftAnswers(state), channels: state.channels, email, parentEmail, terms: true, marketing: false }, noJobs);
  if (!sent.ok) throw new Error(`Couldn't send ${d.name}'s story: ${JSON.stringify(sent)}`);
  const id = sent.storyId;
  await runPrescreen(id, async () => ({ ...CLEAN, ...d.model }));
  if (d.confirm !== false) await confirmStoryEmail(linkIn("confirm_email", email, "confirm"));

  if (d.then === "approve") {
    await approve(moderator, id);
    // The model is not called here: the pack uses the story's own words. Quote card images need the worker.
    await generateContentPack(content, id, null, noJobs);
  } else if (d.then === "changes") {
    await requestChanges(moderator, id, "Could you add one moment that stood out, and what was hard?");
  } else if (d.then === "reject") {
    await reject(moderator, id, "Duplicate of another story.");
  }
  const { status } = await db.story.findUniqueOrThrow({ where: { id }, select: { status: true } });
  console.log(`${d.name.padEnd(6)} ${status}`);
}

console.log("\nSign in to /admin as demo.moderator@springpod.com or demo.content@springpod.com (development sign-in).");
await db.$disconnect();
