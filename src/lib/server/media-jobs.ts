import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Media } from "@/generated/prisma/client";
import { LIMITS, evaluateChecks, verdict, type AudioStats, type Check, type MediaFacts } from "@/lib/media/checks";
import { audioStats, lumaAverage, waveformPeaks } from "@/lib/media/measure";
import { writeAudit } from "./audit";
import { db } from "./db";
import * as ff from "./ffmpeg";
import { QUEUES, sendJob, type SendJob } from "./jobs";
import { mediaKeys } from "./media";
import { deleteObjects, downloadToFile, putObject } from "./storage";
import { transcriber as defaultTranscriber, type Transcriber } from "./transcribe";

/**
 * The media worker's jobs (PRD 7.2). Every result is stored on the media record, using the same
 * check rules as the browser; the server's result wins. A file replaced while a job runs is left
 * alone and anything the job produced for it is deleted.
 */

const ANALYSIS_RATE = 8000;
const FRAME_WIDTH = 48;

export interface ServerResult {
  checks: Check[];
  /** Extra measurements for staff (shown in the admin, milestone 5). */
  metrics: {
    container: string;
    videoCodec: string | null;
    audioCodec: string | null;
    rotation: number;
    lufs: number | null;
    truePeakDb: number | null;
    blur: number | null;
    trimmedToS: number | null;
  };
}

async function stillCurrent(mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { current: true, deletedAt: true } });
  return Boolean(m?.current && !m.deletedAt);
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "wes-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Facts for the shared checks, from the server's own measurements. */
export function serverFacts(media: Pick<Media, "kind" | "sizeBytes">, p: ff.Probe, audio: AudioStats | null, brightness: number | null): MediaFacts {
  const needed = media.kind === "video" ? p.video : p.audio;
  return {
    kind: media.kind,
    // The file type check passes only if the stream we need is really there.
    mimeType: needed ? (media.kind === "video" ? "video/*" : "audio/*") : "",
    fileName: "",
    sizeBytes: Number(media.sizeBytes),
    durationS: p.durationS,
    width: p.video?.width ?? null,
    height: p.video?.height ?? null,
    brightness,
    // A video with no soundtrack has nothing to hear.
    audio: p.audio ? audio : { silent: true },
  };
}

type ProcessOutcome = "skipped" | "unreadable" | "failed_checks" | "processed";

/** Server checks, conversion, poster frame and waveform, then queues the transcript. */
export async function processMedia(mediaId: string, send: SendJob = sendJob): Promise<ProcessOutcome> {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || !media.current || media.deletedAt || !["uploaded", "processing"].includes(media.status)) return "skipped";
  await db.media.update({ where: { id: media.id }, data: { status: "processing" } });
  const keys = mediaKeys(media.storyId, media.id);
  const limit = LIMITS[media.kind];

  return withTemp(async (dir) => {
    const original = join(dir, "original");
    await downloadToFile(media.storageKey, original);

    let p: ff.Probe;
    try {
      p = await ff.probe(original);
    } catch {
      // Not a media file at all: fail the type check rather than retrying.
      const checks = evaluateChecks(serverFacts(media, { container: "unknown", durationS: null, video: null, audio: null }, null, null));
      await finish(media, { status: "ready", serverChecks: { checks, metrics: null } as object }, "media_checked", { verdict: "fail" });
      return "unreadable";
    }

    const samples = p.audio ? await ff.decodeAudio(original, ANALYSIS_RATE, limit.hardMaxS) : new Float32Array();
    const audio = p.audio ? audioStats(samples, ANALYSIS_RATE) : null;
    let brightness: number | null = null;
    if (p.video) {
      const values: number[] = [];
      for (const at of [0.25, 0.6]) {
        const rgb = await ff.frameRgb(original, Math.max(0.1, (p.durationS ?? 4) * at), FRAME_WIDTH).catch(() => null);
        if (rgb?.length) values.push(lumaAverage(rgb, 3));
      }
      brightness = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    const checks = evaluateChecks(serverFacts(media, p, audio, brightness));
    const loud = p.audio ? await ff.loudness(original).catch(() => ({ lufs: null, truePeakDb: null })) : { lufs: null, truePeakDb: null };
    const blur = p.video ? await ff.blurScore(original, limit.maxS).catch(() => null) : null;
    const trimmedToS = p.durationS && p.durationS > limit.maxS ? limit.maxS : null;
    const result: ServerResult = {
      checks,
      metrics: {
        container: p.container,
        videoCodec: p.video?.codec ?? null,
        audioCodec: p.audio?.codec ?? null,
        rotation: p.video?.rotation ?? 0,
        lufs: loud.lufs,
        truePeakDb: loud.truePeakDb,
        blur,
        trimmedToS,
      },
    };
    const facts = { durationS: p.durationS, width: p.video?.width ?? null, height: p.video?.height ?? null };

    // A file that fails the server checks isn't converted or transcribed; the person is asked for another.
    if (verdict(checks) === "fail") {
      await finish(media, { status: "ready", serverChecks: result as object, ...facts }, "media_checked", { verdict: "fail" });
      return "failed_checks";
    }

    const normalised = join(dir, "normalised");
    await ff.normalise(original, normalised, media.kind, limit.maxS);
    let posterKey: string | null = null;
    if (p.video) {
      const posterPath = join(dir, "poster.jpg");
      await ff.poster(normalised, posterPath, Math.min(limit.maxS, p.durationS ?? 2) * 0.25);
      await putObject(keys.poster, await readFile(posterPath), "image/jpeg");
      posterKey = keys.poster;
    }
    const speech = join(dir, "audio.wav");
    await ff.speechAudio(original, speech, limit.maxS);
    await putObject(keys.normalised, await readFile(normalised), media.kind === "video" ? "video/mp4" : "audio/mp4");
    await putObject(keys.audio, await readFile(speech), "audio/wav");
    const peaks = waveformPeaks(samples.subarray(0, limit.maxS * ANALYSIS_RATE));
    await putObject(keys.waveform, JSON.stringify(peaks), "application/json");

    const stored = await finish(
      media,
      { serverChecks: result as object, normalisedKey: keys.normalised, posterKey, waveformKey: keys.waveform, ...facts },
      "media_checked",
      { verdict: verdict(checks) },
    );
    if (stored) await send(QUEUES.transcribe, { mediaId: media.id });
    return "processed";
  });
}

/** Saves a job's results, unless the file was replaced meanwhile, in which case its outputs are deleted. */
async function finish(
  media: Media,
  data: Parameters<typeof db.media.update>[0]["data"],
  action: string,
  payload: Record<string, string | number | null>,
): Promise<boolean> {
  const saved = await db.$transaction(async (tx) => {
    const { count } = await tx.media.updateMany({ where: { id: media.id, current: true, deletedAt: null }, data });
    if (count) await writeAudit(tx, { storyId: media.storyId, actorType: "system", action, payload: { mediaId: media.id, ...payload } });
    return count > 0;
  });
  if (!saved) await deleteObjects(Object.values(mediaKeys(media.storyId, media.id)));
  return saved;
}

/** Speech to text with timestamps; then the file is ready. */
export async function transcribeMedia(mediaId: string, provider: Transcriber = defaultTranscriber()): Promise<"skipped" | "transcribed"> {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || !(await stillCurrent(mediaId)) || media.status !== "processing") return "skipped";
  const keys = mediaKeys(media.storyId, media.id);
  const transcript = await withTemp(async (dir) => {
    const local = join(dir, "audio.wav");
    await downloadToFile(keys.audio, local);
    return provider.transcribe({
      key: keys.audio,
      localPath: local,
      durationS: Math.min(media.durationS ?? LIMITS[media.kind].maxS, LIMITS[media.kind].maxS),
      jobId: media.id,
    });
  });
  await finish(
    media,
    {
      status: "ready",
      transcriptRaw: transcript.text,
      transcriptConfidence: transcript.confidence,
      transcriptSegments: transcript.segments as object[],
    },
    "media_transcribed",
    { provider: provider.name, confidence: transcript.confidence },
  );
  return "transcribed";
}

/**
 * After the last retry. A failed conversion marks the file failed so the person can try another;
 * a failed transcript still lets them carry on by typing what they said.
 */
export async function giveUp(queue: string, mediaId: string) {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media) return;
  if (queue === QUEUES.transcribe) {
    await finish(media, { status: "ready", transcriptRaw: "", transcriptConfidence: null }, "media_transcribe_failed", {});
  } else {
    await finish(media, { status: "failed" }, "media_process_failed", {});
  }
}

