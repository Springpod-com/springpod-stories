import "server-only";
import type { AssetKind } from "@/generated/prisma/client";
import { displayName } from "@/flow/display";
import { claudeJson } from "@/lib/ai/claude";
import { aiConfigured, MODELS } from "@/lib/ai/client";
import {
  allowedAssets,
  contentPackFallback,
  contentPackSchema,
  normaliseContentPack,
  type ContentPackGenerate,
  type TextAssetKind,
} from "@/lib/ai/content-pack";
import { contentPackPrompt } from "@/lib/ai/prompts";
import { staffLabel, type Staff } from "@/lib/staff";
import { stateFromStory } from "@/lib/story-data";
import { writeAudit } from "./audit";
import { db } from "./db";
import { QUEUES, sendJob, type SendJob } from "./jobs";
import { presignRead } from "./storage";
import { trackServer } from "./track";

/**
 * Content packs (PRD 12). Made on request by staff with the content role, from a story in review
 * or approved. Only the assets for the channels the person agreed to are made and kept. Each
 * generation adds new asset rows, so earlier versions stay as history.
 */

const defaultGenerate = (): ContentPackGenerate | null => (aiConfigured() ? claudeJson(MODELS.balanced, contentPackSchema) : null);

const PACK_STATUSES = ["in_review", "approved"] as const;
const CARD_KINDS = ["quote_card_4x5", "quote_card_9x16"] as const;
const STAFF_URL_S = 60 * 60;

export type PackResult = { ok: true; fallback: boolean } | { ok: false; problem: string };

export async function generateContentPack(
  staff: Staff,
  storyId: string,
  generate: ContentPackGenerate | null = defaultGenerate(),
  send: SendJob = sendJob,
): Promise<PackResult> {
  if (staff.role !== "content") return { ok: false, problem: "Only the content team can make content packs." };
  const story = await db.story.findUnique({ where: { id: storyId }, include: { consent: { select: { channels: true } } } });
  if (!story || !PACK_STATUSES.includes(story.status as (typeof PACK_STATUSES)[number])) {
    return { ok: false, problem: "Content packs are for stories in review or approved." };
  }
  const allowed = allowedAssets(story.consent?.channels ?? []);
  const state = stateFromStory(story);

  let assets = null;
  if (generate) {
    try {
      assets = normaliseContentPack(
        await generate(
          contentPackPrompt({
            displayName: displayName(state),
            organisation: story.organisation ?? "",
            label: story.trustLabel === "verified" ? "Springpod programme" : "community",
            headline: story.headline ?? "",
            expType: story.expType ?? "",
            area: story.area ?? "",
            story: story.story ?? "",
          }),
        ),
        allowed,
      );
    } catch (e) {
      console.error("Content pack failed", e instanceof Error ? e.message : e);
    }
  }
  const fallback = !assets;
  assets ??= contentPackFallback(
    { headline: story.headline ?? "", story: story.story ?? "", pullQuote: story.pullQuote ?? "", skills: story.skills, sector: story.sector ?? "" },
    allowed,
  );

  await db.$transaction(async (tx) => {
    await tx.asset.createMany({
      data: Object.entries(assets).map(([kind, content]) => ({ storyId, kind: kind as AssetKind, content, createdBy: staffLabel(staff) })),
    });
    await writeAudit(tx, { storyId, actorType: "staff", actorId: staff.id, action: "content_pack_made", payload: { fallback, kinds: Object.keys(assets) } });
  });
  // The quote card images are drawn by the worker (headless Chromium).
  await send(QUEUES.quoteCards, { storyId });
  void trackServer(storyId, "content_pack_generated", { kinds: Object.keys(assets).join(",") });
  return { ok: true, fallback };
}

export interface PackAsset {
  id: string;
  kind: AssetKind;
  content: string | null;
  url: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface PackView {
  allowed: TextAssetKind[];
  /** The newest version of each asset. */
  latest: Partial<Record<AssetKind, PackAsset>>;
  /** Earlier versions, newest first. */
  history: PackAsset[];
}

export async function contentPackView(storyId: string): Promise<PackView | null> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { consent: { select: { channels: true } } } });
  if (!story) return null;
  const allowed = allowedAssets(story.consent?.channels ?? []);
  const rows = await db.asset.findMany({ where: { storyId, withdrawnAt: null }, orderBy: { createdAt: "desc" } });
  const latest: PackView["latest"] = {};
  const history: PackAsset[] = [];
  for (const r of rows) {
    // Only what the person agreed to is ever shown (acceptance criterion 10).
    if (!CARD_KINDS.includes(r.kind as (typeof CARD_KINDS)[number]) && !allowed.includes(r.kind as TextAssetKind)) continue;
    const asset: PackAsset = {
      id: r.id,
      kind: r.kind,
      content: r.content,
      url: r.storageKey ? await presignRead(r.storageKey, `${r.kind}.png`, STAFF_URL_S) : null,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    };
    if (latest[r.kind]) history.push(asset);
    else latest[r.kind] = asset;
  }
  return { allowed, latest, history };
}
