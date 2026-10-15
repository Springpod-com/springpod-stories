import "server-only";
import type { Media } from "@/generated/prisma/client";
import { quickChecks, type Check } from "@/lib/media/checks";
import type { CreateMedia, CreatedMedia, MediaView, UpdateMedia } from "@/lib/media/schema";
import { writeAudit } from "./audit";
import { db, type Tx } from "./db";
import { QUEUES, sendJob, type SendJob } from "./jobs";
import {
  PART_SIZE,
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObjects,
  objectSize,
  presignRead,
  presignUploadPart,
} from "./storage";

/**
 * Media for a draft story (PRD 7). The browser uploads straight to private storage in parts,
 * then the worker checks, converts and transcribes it. Only the device that owns the draft can
 * touch its media, and only while the story is still a draft.
 */

export const mediaKeys = (storyId: string, mediaId: string) => {
  const base = `media/${storyId}/${mediaId}`;
  return {
    original: `${base}/original`,
    normalised: `${base}/normalised`,
    poster: `${base}/poster.jpg`,
    waveform: `${base}/waveform.json`,
    audio: `${base}/audio.wav`,
  };
};

/** Every object a media row may have in storage. */
export const allKeys = (m: Pick<Media, "id" | "storyId">) => Object.values(mediaKeys(m.storyId, m.id));

const partCount = (sizeBytes: number) => Math.max(1, Math.ceil(sizeBytes / PART_SIZE));

/**
 * File names are never kept: people name files after themselves ("Sam Smith story.mov") and we
 * don't collect surnames. Only the extension survives, which helps the converter.
 */
export function safeName(kind: CreateMedia["kind"], fileName: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  return `${kind === "video" ? "video" : "voice-note"}${ext ? `.${ext}` : ""}`;
}

function ownedMedia(device: string, mediaId: string) {
  return db.media.findFirst({
    where: { id: mediaId, current: true, deletedAt: null, story: { deviceIdHash: device, status: "draft" } },
  });
}

/** Removes stored files and multipart uploads. Storage errors are logged, not thrown: the row is still marked. */
async function removeObjects(media: Media[]) {
  for (const m of media) {
    try {
      if (m.uploadId) await abortMultipartUpload(m.storageKey, m.uploadId).catch(() => undefined);
      await deleteObjects(allKeys(m));
    } catch (e) {
      console.error("Media delete failed", m.id, e);
    }
  }
}

/** Deletes every file for these stories, for "Start again" and the under-14 path (PRD 9.1). */
export async function purgeStoryMedia(storyIds: string[]) {
  if (!storyIds.length) return;
  const media = await db.media.findMany({ where: { storyId: { in: storyIds }, deletedAt: null } });
  await removeObjects(media);
  await db.media.updateMany({
    where: { id: { in: media.map((m) => m.id) } },
    data: { current: false, status: "deleted", deletedAt: new Date(), uploadId: null },
  });
}

async function retire(tx: Tx, storyId: string, action: string) {
  const old = await tx.media.findMany({ where: { storyId, current: true, deletedAt: null } });
  if (!old.length) return old;
  await tx.media.updateMany({
    where: { id: { in: old.map((m) => m.id) } },
    data: { current: false, status: "deleted", deletedAt: new Date(), uploadId: null },
  });
  await writeAudit(tx, { storyId, actorType: "submitter", action, payload: { mediaIds: old.map((m) => m.id) } });
  return old;
}

export type CreateResult = ({ ok: true } & CreatedMedia) | { ok: false; problem: "no_draft" | "rejected"; message?: string };

/**
 * Starts an upload. A story has one current file, so a new one replaces the last
 * ("Film again" or "Upload a different file") and the old file is deleted.
 */
export async function createMedia(device: string, input: CreateMedia): Promise<CreateResult> {
  const story = await db.story.findFirst({
    where: { deviceIdHash: device, status: "draft" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!story) return { ok: false, problem: "no_draft" };

  const failed = Object.values(quickChecks(input)).find((c) => c?.state === "fail");
  if (failed) return { ok: false, problem: "rejected", message: failed.detail };

  const media = await db.media.create({
    data: {
      storyId: story.id,
      kind: input.kind,
      storageKey: "",
      originalName: safeName(input.kind, input.fileName),
      mimeType: input.mimeType || null,
      sizeBytes: BigInt(input.sizeBytes),
      current: false,
    },
  });
  const key = mediaKeys(story.id, media.id).original;
  let uploadId: string;
  try {
    uploadId = await createMultipartUpload(key, input.mimeType);
  } catch (e) {
    await db.media.delete({ where: { id: media.id } });
    throw e;
  }

  const old = await db.$transaction(async (tx) => {
    const replaced = await retire(tx, story.id, "media_replaced");
    await tx.media.update({ where: { id: media.id }, data: { storageKey: key, uploadId, current: true } });
    await writeAudit(tx, {
      storyId: story.id,
      actorType: "submitter",
      action: "media_upload_started",
      payload: { mediaId: media.id, kind: input.kind, sizeBytes: input.sizeBytes },
    });
    return replaced;
  });
  await removeObjects(old);
  return { ok: true, mediaId: media.id, partSize: PART_SIZE, partCount: partCount(input.sizeBytes) };
}

export async function partUrls(device: string, mediaId: string, partNumbers: number[]) {
  const media = await ownedMedia(device, mediaId);
  if (!media || media.status !== "uploading" || !media.uploadId) return null;
  const count = partCount(Number(media.sizeBytes));
  if (partNumbers.some((n) => n > count)) return null;
  const uploadId = media.uploadId;
  return Promise.all(
    [...new Set(partNumbers)].map(async (partNumber) => ({
      partNumber,
      url: await presignUploadPart(media.storageKey, uploadId, partNumber),
    })),
  );
}

export type CompleteResult = { ok: true } | { ok: false; problem: "not_found" | "incomplete" };

/** Finishes the upload and queues the server checks. Safe to call again after a dropped connection. */
export async function completeUpload(
  device: string,
  mediaId: string,
  parts: { partNumber: number; etag: string }[],
  send: SendJob = sendJob,
): Promise<CompleteResult> {
  const media = await ownedMedia(device, mediaId);
  if (!media) return { ok: false, problem: "not_found" };
  if (media.status !== "uploading") return { ok: true };
  if (!media.uploadId) return { ok: false, problem: "not_found" };

  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const count = partCount(Number(media.sizeBytes));
  if (sorted.length !== count || sorted.some((p, i) => p.partNumber !== i + 1)) return { ok: false, problem: "incomplete" };

  try {
    await completeMultipartUpload(media.storageKey, media.uploadId, sorted);
  } catch (e) {
    console.error("Complete upload failed", media.id, e);
    return { ok: false, problem: "incomplete" };
  }
  // The stored file must be the size the browser declared, so the size check can be trusted.
  if ((await objectSize(media.storageKey)) !== Number(media.sizeBytes)) {
    await removeObjects([media]);
    await db.media.update({ where: { id: media.id }, data: { status: "failed", uploadId: null } });
    return { ok: false, problem: "incomplete" };
  }

  await db.$transaction(async (tx) => {
    await tx.media.update({ where: { id: media.id }, data: { status: "uploaded", uploadId: null } });
    await writeAudit(tx, { storyId: media.storyId, actorType: "submitter", action: "media_uploaded", payload: { mediaId: media.id } });
  });
  await send(QUEUES.process, { mediaId: media.id });
  return { ok: true };
}

/** Cancels an upload or removes the current file. */
export async function removeMedia(device: string, mediaId: string): Promise<boolean> {
  const media = await ownedMedia(device, mediaId);
  if (!media) return false;
  const old = await db.$transaction((tx) => retire(tx, media.storyId, "media_removed"));
  await removeObjects(old);
  return true;
}

export type UpdateResult = { ok: true } | { ok: false; problem: "not_found" | "not_ready" };

/** Saves what the browser measured, and the person's edits to the transcript. */
export async function updateMedia(device: string, mediaId: string, update: UpdateMedia): Promise<UpdateResult> {
  const media = await ownedMedia(device, mediaId);
  if (!media) return { ok: false, problem: "not_found" };
  if (update.transcript !== undefined && (media.status !== "ready" || media.transcriptRaw === null)) {
    return { ok: false, problem: "not_ready" };
  }
  await db.media.update({
    where: { id: media.id },
    data: {
      ...(update.facts && media.status === "uploading" ? update.facts : {}),
      ...(update.browserChecks ? { browserChecks: update.browserChecks } : {}),
      ...(update.transcript !== undefined ? { transcriptEdited: update.transcript.trim() } : {}),
    },
  });
  return { ok: true };
}

export async function toView(media: Media): Promise<MediaView> {
  const stored = media.status !== "uploading" && media.status !== "deleted";
  const playable = media.status === "ready" ? (media.normalisedKey ?? media.storageKey) : stored ? media.storageKey : null;
  return {
    id: media.id,
    kind: media.kind,
    status: media.status,
    durationS: media.durationS,
    browserChecks: (media.browserChecks as Check[] | null) ?? null,
    serverChecks: (media.serverChecks as { checks?: Check[] } | null)?.checks ?? null,
    transcript: media.status === "ready" ? (media.transcriptEdited ?? media.transcriptRaw) : null,
    transcriptEdited: media.transcriptEdited !== null,
    playbackUrl: playable ? await presignRead(playable) : null,
    posterUrl: media.status === "ready" && media.posterKey ? await presignRead(media.posterKey) : null,
  };
}

export async function getMedia(device: string, mediaId: string): Promise<MediaView | null> {
  const media = await ownedMedia(device, mediaId);
  return media ? toView(media) : null;
}

/** The draft's current file, for resuming and for the submit rules. */
export function currentMedia(storyId: string) {
  return db.media.findFirst({ where: { storyId, current: true, deletedAt: null } });
}
