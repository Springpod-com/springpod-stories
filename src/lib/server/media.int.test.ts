import { describe, expect, it, vi } from "vitest";
import { initialState } from "@/flow/state";
import { pickDraftAnswers } from "@/lib/story-data";
import { db } from "./db";
import type { SendJob } from "./jobs";
import { completeUpload, createMedia, getMedia, partUrls, removeMedia, safeName, updateMedia } from "./media";
import { deleteDraft, saveDraft } from "./stories";
import { PART_SIZE, objectSize } from "./storage";

const DEVICE = "device-media";
const MB = 1048576;

async function draft(device = DEVICE) {
  await saveDraft(device, pickDraftAnswers({ ...initialState, who: "student", age: "18 to 24", firstName: "Sam", mode: "self", format: "video" }));
}

/** Uploads every part the way the browser does: signed PUTs straight to storage. */
async function uploadParts(mediaId: string, body: Uint8Array, device = DEVICE) {
  const count = Math.ceil(body.length / PART_SIZE);
  const urls = await partUrls(device, mediaId, Array.from({ length: count }, (_, i) => i + 1));
  expect(urls).toHaveLength(count);
  return Promise.all(
    urls!.map(async ({ partNumber, url }) => {
      const res = await fetch(url, { method: "PUT", body: body.slice((partNumber - 1) * PART_SIZE, partNumber * PART_SIZE) });
      expect(res.status).toBe(200);
      return { partNumber, etag: res.headers.get("etag")! };
    }),
  );
}

const video = (sizeBytes: number) => ({ kind: "video" as const, fileName: "Sam Smith story.MOV", mimeType: "video/quicktime", sizeBytes });

describe("media uploads (PRD 7)", () => {
  it("needs a draft first", async () => {
    expect(await createMedia(DEVICE, video(MB))).toEqual({ ok: false, problem: "no_draft" });
  });

  it("refuses a file the quick checks fail, with the check's own message", async () => {
    await draft();
    expect(await createMedia(DEVICE, video(251 * MB))).toEqual({
      ok: false,
      problem: "rejected",
      message: "251 MB is over the 250 MB limit. Record a shorter video, or film at 1080p rather than 4K.",
    });
    expect(await createMedia(DEVICE, { ...video(MB), mimeType: "application/pdf", fileName: "a.pdf" })).toMatchObject({
      problem: "rejected",
    });
    expect(await db.media.count()).toBe(0);
  });

  it("uploads in parts, checks the stored size, and queues the server checks", async () => {
    await draft();
    const body = new Uint8Array(PART_SIZE + 2 * MB).fill(7);
    const created = await createMedia(DEVICE, video(body.length));
    expect(created).toMatchObject({ ok: true, partSize: PART_SIZE, partCount: 2 });
    if (!created.ok) return;

    const parts = await uploadParts(created.mediaId, body);
    const send = vi.fn<SendJob>(async () => undefined);
    expect(await completeUpload(DEVICE, created.mediaId, parts.reverse(), send)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("media-process", { mediaId: created.mediaId });

    const media = await db.media.findUniqueOrThrow({ where: { id: created.mediaId } });
    expect(media).toMatchObject({ status: "uploaded", uploadId: null, current: true, originalName: "video.mov" });
    expect(await objectSize(media.storageKey)).toBe(body.length);

    // A repeat after a dropped connection is harmless and doesn't queue twice.
    expect(await completeUpload(DEVICE, created.mediaId, parts, send)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);

    const view = await getMedia(DEVICE, created.mediaId);
    expect(view).toMatchObject({ status: "uploaded", transcript: null });
    expect(view?.playbackUrl).toContain("X-Amz-Signature");
    expect(view?.playbackUrl).toContain("X-Amz-Expires=900");
  });

  it("won't complete with missing parts or a file that isn't the declared size", async () => {
    await draft();
    const created = await createMedia(DEVICE, video(PART_SIZE + MB));
    if (!created.ok) throw new Error("not created");
    const [first] = await uploadParts(created.mediaId, new Uint8Array(PART_SIZE + MB));
    expect(await completeUpload(DEVICE, created.mediaId, [first!], vi.fn())).toEqual({ ok: false, problem: "incomplete" });

    const short = await createMedia(DEVICE, video(2 * MB));
    if (!short.ok) throw new Error("not created");
    const parts = await uploadParts(short.mediaId, new Uint8Array(MB));
    const send = vi.fn<SendJob>();
    expect(await completeUpload(DEVICE, short.mediaId, parts, send)).toEqual({ ok: false, problem: "incomplete" });
    expect(send).not.toHaveBeenCalled();
    expect((await db.media.findUniqueOrThrow({ where: { id: short.mediaId } })).status).toBe("failed");
  });

  it("replaces the old file when a new one is chosen, and deletes it from storage", async () => {
    await draft();
    const first = await createMedia(DEVICE, video(MB));
    if (!first.ok) throw new Error("not created");
    await completeUpload(DEVICE, first.mediaId, await uploadParts(first.mediaId, new Uint8Array(MB)), vi.fn());
    const firstKey = (await db.media.findUniqueOrThrow({ where: { id: first.mediaId } })).storageKey;

    const second = await createMedia(DEVICE, video(MB));
    if (!second.ok) throw new Error("not created");
    const old = await db.media.findUniqueOrThrow({ where: { id: first.mediaId } });
    expect(old).toMatchObject({ current: false, status: "deleted" });
    expect(await objectSize(firstKey)).toBeNull();
    expect(await getMedia(DEVICE, first.mediaId)).toBeNull();
    expect(await db.auditEvent.count({ where: { action: "media_replaced" } })).toBe(1);
  });

  it("only lets the owning device see or change a file", async () => {
    await draft();
    const created = await createMedia(DEVICE, video(MB));
    if (!created.ok) throw new Error("not created");
    expect(await getMedia("someone-else", created.mediaId)).toBeNull();
    expect(await partUrls("someone-else", created.mediaId, [1])).toBeNull();
    expect(await removeMedia("someone-else", created.mediaId)).toBe(false);
    expect(await updateMedia("someone-else", created.mediaId, { transcript: "Hi" })).toEqual({ ok: false, problem: "not_found" });
  });

  it("only takes transcript edits once the transcript exists", async () => {
    await draft();
    const created = await createMedia(DEVICE, video(MB));
    if (!created.ok) throw new Error("not created");
    expect(await updateMedia(DEVICE, created.mediaId, { transcript: "Edited" })).toEqual({ ok: false, problem: "not_ready" });
    await db.media.update({ where: { id: created.mediaId }, data: { status: "ready", transcriptRaw: "Raw words" } });
    expect(await getMedia(DEVICE, created.mediaId)).toMatchObject({ transcript: "Raw words", transcriptEdited: false });
    expect(await updateMedia(DEVICE, created.mediaId, { transcript: "  Edited words " })).toEqual({ ok: true });
    expect(await getMedia(DEVICE, created.mediaId)).toMatchObject({ transcript: "Edited words", transcriptEdited: true });
  });

  it("deletes the files when the person starts again", async () => {
    await draft();
    const created = await createMedia(DEVICE, video(MB));
    if (!created.ok) throw new Error("not created");
    await completeUpload(DEVICE, created.mediaId, await uploadParts(created.mediaId, new Uint8Array(MB)), vi.fn());
    const key = (await db.media.findUniqueOrThrow({ where: { id: created.mediaId } })).storageKey;
    await deleteDraft(DEVICE);
    expect(await objectSize(key)).toBeNull();
    expect(await db.media.count()).toBe(0);
  });

  it("never keeps the original file name", () => {
    expect(safeName("video", "Sam Smith at Arup.MOV")).toBe("video.mov");
    expect(safeName("voice", "New Recording 12.m4a")).toBe("voice-note.m4a");
    expect(safeName("voice", "recording")).toBe("voice-note");
  });
});
