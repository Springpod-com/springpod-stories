import "server-only";
import type { AgeBand, Channel, Prisma, StoryFormat, StoryStatus, TrustLabel } from "@/generated/prisma/client";
import { cardLines, displayName } from "@/flow/display";
import { NOW_OPTIONS } from "@/flow/options";
import type { Check } from "@/lib/media/checks";
import { stateFromStory } from "@/lib/story-data";
import { db } from "./db";
import { presignRead } from "./storage";

/**
 * Reads for the team backend (PRD 11). Contact details are never selected: no submitter or
 * parent email reaches the queue, the detail page or anything exported from them (PRD 9.3).
 */

export interface QueueFilters {
  status?: StoryStatus;
  format?: StoryFormat;
  trust?: TrustLabel;
  age?: AgeBand;
  channel?: Channel;
  media?: "yes" | "no";
  safeguarding?: "yes";
  q?: string;
}

/** Statuses waiting on the team (PRD 11.1 "To review"). */
export const TO_REVIEW: StoryStatus[] = ["in_review", "safeguarding_review"];

function where(f: QueueFilters): Prisma.StoryWhereInput {
  const and: Prisma.StoryWhereInput[] = [{ status: { not: "draft" } }];
  if (f.status) and.push({ status: f.status });
  if (f.format) and.push({ format: f.format });
  if (f.trust) and.push({ trustLabel: f.trust });
  if (f.age) and.push({ ageBand: f.age });
  if (f.channel) and.push({ consent: { channels: { has: f.channel } } });
  if (f.media === "yes") and.push({ media: { some: { current: true, deletedAt: null } } });
  if (f.media === "no") and.push({ media: { none: { current: true, deletedAt: null } } });
  if (f.safeguarding) {
    and.push({ OR: [{ status: "safeguarding_review" }, { flags: { some: { type: "safeguarding", resolvedAt: null } } }] });
  }
  const q = f.q?.trim();
  if (q) and.push({ OR: [{ headline: { contains: q, mode: "insensitive" } }, { story: { contains: q, mode: "insensitive" } }] });
  return { AND: and };
}

const QUEUE_SELECT = {
  id: true,
  status: true,
  headline: true,
  firstName: true,
  displayChoice: true,
  expType: true,
  format: true,
  trustLabel: true,
  submittedAt: true,
  flags: { where: { type: "safeguarding", resolvedAt: null }, select: { id: true } },
} satisfies Prisma.StorySelect;

export interface QueueItem {
  id: string;
  status: StoryStatus;
  headline: string;
  name: string;
  expType: string;
  format: StoryFormat | null;
  trust: TrustLabel;
  submittedAt: Date | null;
  safeguarding: boolean;
}

const nameShown = (s: { firstName: string | null; displayChoice: "first" | "initial" | "anon" | null }) =>
  s.displayChoice === "anon" ? "Anonymous" : s.displayChoice === "initial" ? `${(s.firstName ?? "?").charAt(0).toUpperCase()}.` : (s.firstName ?? "");

export async function queue(filters: QueueFilters, limit = 200): Promise<QueueItem[]> {
  const rows = await db.story.findMany({ where: where(filters), select: QUEUE_SELECT, orderBy: { submittedAt: "desc" }, take: limit });
  return rows.map((s) => ({
    id: s.id,
    status: s.status,
    headline: s.headline ?? "",
    name: nameShown(s),
    expType: s.expType ?? "",
    format: s.format,
    trust: s.trustLabel,
    submittedAt: s.submittedAt,
    safeguarding: s.status === "safeguarding_review" || s.flags.length > 0,
  }));
}

export async function queueCounts() {
  const [toReview, approved, total] = await Promise.all([
    db.story.count({ where: { status: { in: TO_REVIEW } } }),
    db.story.count({ where: { status: "approved" } }),
    db.story.count({ where: { status: { not: "draft" } } }),
  ]);
  return { toReview, approved, total };
}

/** Checklist items per media kind (PRD 11.2). Ids are stored with each tick. */
export const TEAM_CHECKS = {
  video: [
    { id: "no_people", label: "No other people can be identified" },
    { id: "no_uniform", label: "No school uniform, badges or logos" },
    { id: "no_confidential", label: "Nothing confidential on screen (screens, documents, ID badges)" },
    { id: "audio_captions", label: "Audio is clear enough for captions" },
    { id: "matches_story", label: "Content matches the written story" },
    { id: "consent_age", label: "Consent and age checks match" },
  ],
  voice: [
    { id: "no_full_names", label: "No other people named in full" },
    { id: "no_address", label: "No school or home address mentioned" },
    { id: "no_confidential", label: "Nothing confidential about the workplace" },
    { id: "audio_clip", label: "Audio is clear enough to use as a clip" },
    { id: "matches_story", label: "Content matches the written story" },
  ],
} as const;

export type Checklist = Record<string, { by: string; at: string }>;

export interface StoryDetail {
  id: string;
  status: StoryStatus;
  trust: TrustLabel;
  headline: string;
  story: string;
  skills: string[];
  pullQuote: string;
  card: { quote: string; name: string; then: string; now?: string; trust: TrustLabel };
  facts: {
    nameShown: string;
    age: string;
    experience: string;
    organisation: string;
    area: string;
    now: string;
    submittedAs: string;
    channels: Channel[];
    parentConsent: string;
  };
  parentPending: boolean;
  flags: { id: string; type: string; detail: string; source: string; resolved: boolean }[];
  media: null | {
    kind: "voice" | "video";
    status: string;
    durationS: number | null;
    width: number | null;
    height: number | null;
    playbackUrl: string | null;
    posterUrl: string | null;
    transcript: string | null;
    checks: Check[];
    checksSource: "server" | "browser" | null;
  };
  interview: { role: "assistant" | "user"; content: string }[];
  checklist: Checklist;
  decision: { decision: string; reason: string | null; by: string | null; at: Date | null } | null;
  submittedAt: Date | null;
}

const AGE_LABEL: Record<AgeBand, string> = { age_14_17: "14 to 17", age_18_24: "18 to 24", age_25_plus: "25 or over" };
const FORMAT_LABEL: Record<StoryFormat, string> = { interview: "Interview", write: "Written", voice: "Voice note", video: "Video" };
const PARENT_LABEL = {
  not_needed: "Not needed",
  pending: "Waiting for parent or carer",
  approved: "Approved by parent or carer",
  approved_anonymous: "Approved without name",
  declined: "Declined by parent or carer",
} as const;

/** Staff downloads and playback last longer than the public 15 minutes (build plan section 12). */
const STAFF_URL_S = 60 * 60;

export async function storyDetail(id: string): Promise<StoryDetail | null> {
  const s = await db.story.findFirst({
    where: { id, status: { not: "draft" } },
    include: {
      consent: { select: { channels: true, parentStatus: true } },
      flags: { orderBy: { createdAt: "asc" } },
      media: { where: { current: true, deletedAt: null }, take: 1 },
      review: true,
      interviewTurns: { orderBy: { createdAt: "asc" }, select: { role: true, content: true } },
    },
  });
  if (!s) return null;
  const state = stateFromStory(s);
  const m = s.media[0];
  const serverChecks = (m?.serverChecks as { checks?: Check[] } | null)?.checks ?? null;
  const browserChecks = (m?.browserChecks as Check[] | null) ?? null;
  const playable = m && ["uploaded", "processing", "ready"].includes(m.status) ? (m.normalisedKey ?? m.storageKey) : null;
  const working = s.nowStatus === "working" || s.nowStatus === "apprentice";
  const now = working
    ? [s.nowRole, s.nowCompany ? `${s.nowCompany}${s.showCompany ? "" : " (not public)"}` : null, s.nowIndustry].filter(Boolean).join(" · ")
    : (NOW_OPTIONS.find((o) => o.value === s.nowStatus)?.label ?? "");

  return {
    id: s.id,
    status: s.status,
    trust: s.trustLabel,
    headline: s.headline ?? "",
    story: s.story ?? "",
    skills: s.skills,
    pullQuote: s.pullQuote ?? "",
    card: { quote: s.pullQuote ?? "", name: displayName(state), trust: s.trustLabel, ...cardLines(state) },
    facts: {
      nameShown: nameShown(s),
      age: s.ageBand ? AGE_LABEL[s.ageBand] : "",
      experience: s.expType ?? "",
      organisation: s.organisation ?? "",
      area: s.area ?? "",
      now,
      submittedAs: s.format ? FORMAT_LABEL[s.format] : "",
      channels: s.consent?.channels ?? [],
      parentConsent: PARENT_LABEL[s.consent?.parentStatus ?? "not_needed"],
    },
    parentPending: s.consent?.parentStatus === "pending",
    flags: s.flags.map((f) => ({ id: f.id, type: f.type, detail: f.detail, source: f.source, resolved: Boolean(f.resolvedAt) })),
    media: m
      ? {
          kind: m.kind,
          status: m.status,
          durationS: m.durationS,
          width: m.width,
          height: m.height,
          playbackUrl: playable ? await presignRead(playable, undefined, STAFF_URL_S) : null,
          posterUrl: m.posterKey ? await presignRead(m.posterKey, undefined, STAFF_URL_S) : null,
          transcript: m.transcriptEdited ?? m.transcriptRaw,
          checks: serverChecks ?? browserChecks ?? [],
          checksSource: serverChecks ? "server" : browserChecks ? "browser" : null,
        }
      : null,
    interview: s.interviewTurns,
    checklist: (s.review?.checklist as Checklist | null) ?? {},
    decision: s.review?.decision
      ? { decision: s.review.decision, reason: s.review.reason, by: s.review.decidedBy, at: s.review.decidedAt }
      : null,
    submittedAt: s.submittedAt,
  };
}
