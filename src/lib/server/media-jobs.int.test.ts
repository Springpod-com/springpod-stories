import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "@/flow/state";
import { verdict, type Check } from "@/lib/media/checks";
import { pickDraftAnswers } from "@/lib/story-data";
import { db } from "./db";
import type { SendJob } from "./jobs";
import { mediaKeys } from "./media";
import { convertMedia, giveUp, processMedia, transcribeMedia, type ServerResult } from "./media-jobs";
import { saveDraft } from "./stories";
import { getObjectText, objectSize, putObject } from "./storage";
import { fakeTranscriber, FAKE_TRANSCRIPT_LINES } from "./transcribe/fake";

const DEVICE = "device-worker";

/** A draft with a file already uploaded, as if the browser had just finished. */
async function uploaded(fixture: string, kind: "video" | "voice") {
  const { storyId } = (await saveDraft(
    DEVICE,
    pickDraftAnswers({ ...initialState, who: "student", age: "18 to 24", firstName: "Sam", mode: "self", format: kind }),
  )) as { storyId: string };
  const body = await readFile(`tests/fixtures/media/${fixture}`);
  const media = await db.media.create({
    data: { storyId, kind, storageKey: "", originalName: kind, sizeBytes: BigInt(body.length), status: "uploaded" },
  });
  const key = mediaKeys(storyId, media.id).original;
  await putObject(key, body, "application/octet-stream");
  return db.media.update({ where: { id: media.id }, data: { storageKey: key } });
}

const result = async (id: string) => (await db.media.findUniqueOrThrow({ where: { id } })).serverChecks as unknown as ServerResult;
const state = (checks: Check[], id: string) => checks.find((c) => c.id === id)?.state;

describe("media worker (PRD 7.2)", () => {
  it("checks, converts and transcribes a good video", async () => {
    const media = await uploaded("good-video.webm", "video");
    const send = vi.fn<SendJob>(async () => undefined);
    expect(await processMedia(media.id, send)).toBe("processed");
    // Transcribing and converting run side by side once the checks are saved (acceptance criterion 7).
    expect(send).toHaveBeenCalledWith("media-transcribe", { mediaId: media.id });
    expect(send).toHaveBeenCalledWith("media-convert", { mediaId: media.id });

    const after = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(after).toMatchObject({ status: "processing", width: 720, height: 1280 });
    expect(after.durationS).toBeCloseTo(12, 0);
    const { checks, metrics } = await result(media.id);
    expect(checks.map((c) => [c.id, c.state])).toEqual([
      ["format", "pass"],
      ["length", "pass"],
      ["size", "pass"],
      ["orientation", "pass"],
      ["quality", "pass"],
      ["light", "pass"],
      ["sound", "pass"],
    ]);
    expect(metrics).toMatchObject({ container: expect.stringContaining("webm"), videoCodec: "vp8", audioCodec: "opus" });
    expect(metrics.lufs).toBeLessThan(0);
    expect(metrics.blur).toBeGreaterThanOrEqual(0);

    const keys = mediaKeys(media.storyId, media.id);
    expect(after).toMatchObject({ normalisedKey: null, waveformKey: keys.waveform });
    // Transcribed before the conversion finishes: ready for the person, still converting for playback.
    expect(await transcribeMedia(media.id, fakeTranscriber)).toBe("transcribed");
    expect(await convertMedia(media.id)).toBe("converted");
    expect(await convertMedia(media.id)).toBe("skipped");
    expect(await db.media.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ normalisedKey: keys.normalised, posterKey: keys.poster });
    expect(await objectSize(keys.normalised)).toBeGreaterThan(1000);
    expect(await objectSize(keys.poster)).toBeGreaterThan(1000);
    expect(JSON.parse(await getObjectText(keys.waveform))).toHaveLength(200);

    const done = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(done).toMatchObject({ status: "ready", transcriptRaw: FAKE_TRANSCRIPT_LINES.join(" ") });
    expect(done.transcriptSegments).toHaveLength(FAKE_TRANSCRIPT_LINES.length);
    expect(await db.auditEvent.count({ where: { action: { in: ["media_checked", "media_transcribed"] } } })).toBe(2);
  }, 60_000);

  it("warns on a dark video but still converts it", async () => {
    const media = await uploaded("dark-video.webm", "video");
    expect(await processMedia(media.id, vi.fn())).toBe("processed");
    const { checks } = await result(media.id);
    expect(state(checks, "light")).toBe("warn");
    expect(verdict(checks)).toBe("warn");
  }, 60_000);

  it("fails a short or silent video without converting or transcribing it", async () => {
    for (const [fixture, check] of [
      ["short-video.webm", "length"],
      ["silent-video.webm", "sound"],
    ] as const) {
      await db.$executeRawUnsafe('TRUNCATE "Media", "Story" CASCADE');
      const media = await uploaded(fixture, "video");
      const send = vi.fn<SendJob>();
      expect(await processMedia(media.id, send)).toBe("failed_checks");
      expect(state((await result(media.id)).checks, check)).toBe("fail");
      expect(send).not.toHaveBeenCalled();
      expect(await db.media.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ status: "ready", normalisedKey: null });
    }
  }, 60_000);

  it("checks voice notes with the voice rules", async () => {
    const good = await uploaded("good-voice.ogg", "voice");
    expect(await processMedia(good.id, vi.fn())).toBe("processed");
    expect(await convertMedia(good.id)).toBe("converted");
    expect(verdict((await result(good.id)).checks)).toBe("pass");
    expect((await db.media.findUniqueOrThrow({ where: { id: good.id } })).posterKey).toBeNull();

    await db.$executeRawUnsafe('TRUNCATE "Media", "Story" CASCADE');
    const quiet = await uploaded("quiet-voice.ogg", "voice");
    expect(await processMedia(quiet.id, vi.fn())).toBe("failed_checks");
    expect(state((await result(quiet.id)).checks, "volume")).toBe("fail");
  }, 60_000);

  it("fails the file type check for something that isn't media", async () => {
    const media = await uploaded("not-media.txt", "video");
    expect(await processMedia(media.id, vi.fn())).toBe("unreadable");
    expect(state((await result(media.id)).checks, "format")).toBe("fail");
  });

  it("leaves a replaced file alone", async () => {
    const media = await uploaded("good-voice.ogg", "voice");
    await db.media.update({ where: { id: media.id }, data: { current: false, status: "deleted", deletedAt: new Date() } });
    expect(await processMedia(media.id, vi.fn())).toBe("skipped");
  });

  it("lets people type their story if transcription keeps failing", async () => {
    const media = await uploaded("good-voice.ogg", "voice");
    await db.media.update({ where: { id: media.id }, data: { status: "processing" } });
    await giveUp("media-transcribe", media.id);
    expect(await db.media.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ status: "ready", transcriptRaw: "" });
  });
});
