// Measures a chosen file in the browser for the instant checks (PRD 7.1). Ported from the prototype.
// Anything the browser can't decode comes back as null, which the checks turn into a warning.

import type { AudioStats, MediaFacts, MediaKind } from "./checks";
import { audioStats, lumaAverage } from "./measure";

const META_TIMEOUT_MS = 6000;
const SEEK_TIMEOUT_MS = 2500;
/** Decoding audio holds the whole file in memory; skip it for very large files. */
const MAX_AUDIO_DECODE_MB: Record<MediaKind, number> = { video: 80, voice: 30 };

interface Meta {
  durationS: number | null;
  width: number;
  height: number;
  element: HTMLVideoElement | HTMLAudioElement;
}

function readMeta(url: string, kind: MediaKind): Promise<Meta | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind === "video" ? "video" : "audio");
    let settled = false;
    const end = (value: Meta | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    el.preload = "metadata";
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.onloadedmetadata = () =>
      end({
        durationS: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        width: el instanceof HTMLVideoElement ? el.videoWidth : 0,
        height: el instanceof HTMLVideoElement ? el.videoHeight : 0,
        element: el,
      });
    el.onerror = () => end(null);
    setTimeout(() => end(null), META_TIMEOUT_MS);
    el.src = url;
  });
}

/** Average brightness of frames at 25% and 60% of the video. */
async function frameBrightness(meta: Meta): Promise<number | null> {
  const video = meta.element;
  if (!(video instanceof HTMLVideoElement) || !video.videoWidth) return null;
  try {
    const values: number[] = [];
    for (const at of [0.25, 0.6]) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SEEK_TIMEOUT_MS);
        video.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
        video.currentTime = Math.max(0.1, (meta.durationS ?? 4) * at);
      });
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = Math.max(1, Math.round((48 * video.videoHeight) / video.videoWidth));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      values.push(lumaAverage(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 4));
    }
    return values.reduce((a, b) => a + b, 0) / values.length;
  } catch {
    return null;
  }
}

/** Decodes the soundtrack and measures it. */
async function analyseAudio(file: File): Promise<{ stats: AudioStats; durationS: number } | null> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    void ctx.close();
    return { durationS: buffer.duration, stats: audioStats(buffer.getChannelData(0), buffer.sampleRate) };
  } catch {
    return null;
  }
}

export interface Measured {
  facts: MediaFacts;
  /** Object URL for the preview player. Revoke when the file is replaced. */
  previewUrl: string;
  /** Whether the browser could play it, so a preview is worth showing. */
  previewable: boolean;
}

/** Measures everything the instant checks need. */
export async function measure(file: File, kind: MediaKind): Promise<Measured> {
  const previewUrl = URL.createObjectURL(file);
  const meta = await readMeta(previewUrl, kind);
  const audio = file.size / 1048576 < MAX_AUDIO_DECODE_MB[kind] ? await analyseAudio(file) : null;
  const brightness = kind === "video" && meta ? await frameBrightness(meta) : null;
  return {
    previewUrl,
    previewable: Boolean(meta),
    facts: {
      kind,
      mimeType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
      durationS: meta?.durationS ?? audio?.durationS ?? null,
      width: meta?.width || null,
      height: meta?.height || null,
      brightness,
      audio: audio?.stats ?? null,
    },
  };
}
