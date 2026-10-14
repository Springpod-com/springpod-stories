// Media checks (PRD 7.1). Pure functions: the browser measures the file, these turn the
// measurements into pass, warning or fail with a plain fix. Copy is from the prototype.
// The server runs the same rules on its own measurements (PRD 7.2) and wins where they differ.

export type MediaKind = "voice" | "video";
export type CheckState = "pass" | "warn" | "fail" | "pending";
export type CheckId = "format" | "length" | "size" | "orientation" | "quality" | "light" | "sound" | "volume" | "clarity" | "silence";

export interface Check {
  id: CheckId;
  label: string;
  state: CheckState;
  detail: string;
}

export type AudioStats =
  /** Decoded, but there is nothing to hear. */
  | { silent: true }
  | {
      silent: false;
      /** Overall loudness in dBFS. */
      rmsDb: number;
      /** Highest sample, 0 to 1. */
      peak: number;
      /** Share of samples at or near full scale. */
      clipRatio: number;
      /** Share of half-second windows that are silent. */
      silentRatio: number;
    };

/** What could be measured about a file. `null` means it couldn't be read, which never fails a check. */
export interface MediaFacts {
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  durationS: number | null;
  width?: number | null;
  height?: number | null;
  /** Average brightness (0 to 255) of frames sampled at 25% and 60% of the video. */
  brightness?: number | null;
  audio: AudioStats | null;
}

export const LIMITS = {
  video: {
    minS: 10,
    maxS: 90,
    hardMaxS: 120,
    maxMB: 250,
    types: /^video\//,
    ext: /\.(mp4|mov|m4v|webm|3gp)$/i,
  },
  voice: {
    minS: 20,
    maxS: 180,
    hardMaxS: 195,
    maxMB: 25,
    types: /^audio\//,
    ext: /\.(m4a|mp3|wav|aac|ogg|webm|caf|amr|3gp)$/i,
  },
} as const;

export const LABELS: Record<CheckId, string> = {
  format: "File type",
  length: "Length",
  size: "File size",
  orientation: "Orientation",
  quality: "Picture quality",
  light: "Lighting",
  sound: "Sound",
  volume: "Volume",
  clarity: "Clarity",
  silence: "Talking time",
};

export const CHECK_ORDER: Record<MediaKind, CheckId[]> = {
  video: ["format", "length", "size", "orientation", "quality", "light", "sound"],
  voice: ["format", "length", "size", "volume", "clarity", "silence"],
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

type Result = { state: Exclude<CheckState, "pending">; detail: string };
const pass = (detail: string): Result => ({ state: "pass", detail });
const warn = (detail: string): Result => ({ state: "warn", detail });
const fail = (detail: string): Result => ({ state: "fail", detail });

export const isAcceptedType = (kind: MediaKind, mimeType: string, fileName: string) =>
  LIMITS[kind].types.test(mimeType) || LIMITS[kind].ext.test(fileName);

/** The checks that can be decided from the file alone, before it is decoded. Used to start the upload early. */
export function quickChecks(f: Pick<MediaFacts, "kind" | "mimeType" | "fileName" | "sizeBytes">): Partial<Record<CheckId, Result>> {
  const isVideo = f.kind === "video";
  const limit = LIMITS[f.kind];
  const mb = f.sizeBytes / 1048576;
  return {
    format: isAcceptedType(f.kind, f.mimeType, f.fileName)
      ? pass(isVideo ? "Video file recognised." : "Audio file recognised.")
      : fail(
          isVideo
            ? "That isn't a video file. Try MP4 or MOV, the format your phone camera uses."
            : "That isn't an audio file. Use your phone's voice recorder, which saves M4A or MP3.",
        ),
    size:
      mb <= limit.maxMB
        ? pass(`${mb.toFixed(1)} MB`)
        : fail(
            `${mb.toFixed(0)} MB is over the ${limit.maxMB} MB limit. Record a shorter ${isVideo ? "video, or film at 1080p rather than 4K" : "voice note"}.`,
          ),
  };
}

function lengthCheck(kind: MediaKind, durationS: number | null): Result {
  const limit = LIMITS[kind];
  if (durationS === null || !Number.isFinite(durationS) || durationS <= 0) {
    return warn("We couldn't read the length. We'll check it after you send it.");
  }
  if (durationS < limit.minS) {
    return fail(`${fmtTime(durationS)} is a bit short. Aim for at least ${limit.minS} seconds so there's enough to share.`);
  }
  if (durationS <= limit.maxS) return pass(`${fmtTime(durationS)}. Perfect.`);
  if (durationS <= limit.hardMaxS) return warn(`${fmtTime(durationS)} is slightly long. We'll use the first ${fmtTime(limit.maxS)}.`);
  return fail(`${fmtTime(durationS)} is too long. Keep it under ${fmtTime(limit.maxS)}. Try covering just one great moment.`);
}

function videoChecks(f: MediaFacts): Partial<Record<CheckId, Result>> {
  const w = f.width ?? 0;
  const h = f.height ?? 0;
  const out: Partial<Record<CheckId, Result>> = {};
  if (!w || !h) {
    out.orientation = warn("We couldn't read the picture. We'll check it after you send it.");
    out.quality = warn("We couldn't read the picture. We'll check it after you send it.");
  } else {
    out.orientation =
      h > w * 1.1
        ? pass("Portrait. Great for social media.")
        : Math.abs(h - w) <= w * 0.1
          ? pass("Square. Works everywhere.")
          : warn("Landscape works on our website, but portrait works best for social. Turn your phone upright next time.");
    const short = Math.min(w, h);
    out.quality =
      short >= 720
        ? pass(`${w} × ${h}. Sharp enough to share.`)
        : short >= 480
          ? warn(`${w} × ${h} is a little low. Check your camera is set to 1080p.`)
          : warn(`${w} × ${h} is low quality. Record with your phone's main camera app at 1080p.`);
  }
  const b = f.brightness;
  out.light =
    b === null || b === undefined
      ? warn("We couldn't check the lighting. Watch it back to make sure you can see your face.")
      : b < 55
        ? warn("It looks dark. Face a window or turn on a light in front of you.")
        : b > 225
          ? warn("It looks very bright. Move out of direct sunlight.")
          : pass("Good, clear lighting.");
  const a = f.audio;
  out.sound = !a
    ? warn("We couldn't check the sound. Watch it back to make sure you can hear yourself.")
    : a.silent
      ? fail("We can't hear any sound. Check your microphone isn't covered and try again.")
      : a.rmsDb < -38
        ? warn("You sound quiet. Move closer to the phone or speak up a little.")
        : a.clipRatio > 0.002
          ? warn("The sound is distorting. Move the phone a little further away.")
          : pass("Clear sound.");
  return out;
}

function voiceChecks(f: MediaFacts): Partial<Record<CheckId, Result>> {
  const a = f.audio;
  if (!a) {
    const later = warn("We couldn't check this here. We'll check it after you send it.");
    return { volume: later, clarity: { ...later }, silence: { ...later } };
  }
  if (a.silent) {
    const later = warn("We'll check this once we can hear you.");
    return {
      volume: fail("We can't hear anything. Check the microphone isn't covered and try again."),
      clarity: later,
      silence: { ...later },
    };
  }
  return {
    // A near-silent file fails before the quieter-than-ideal warning (build plan C6).
    volume:
      a.peak < 0.05
        ? fail("We can barely hear anything. Check the microphone isn't covered.")
        : a.rmsDb < -40
          ? warn("It's quiet. Hold the phone a hand's width from your mouth and speak up a little.")
          : pass("Good volume."),
    clarity: a.clipRatio > 0.002 ? warn("Some parts are distorted. Hold the phone a little further away.") : pass("No distortion."),
    silence:
      a.silentRatio > 0.6
        ? warn("There's a lot of silence. That's fine, but make sure the whole story is in there.")
        : pass("Plenty of talking."),
  };
}

/** Every check for a file, in display order. */
export function evaluateChecks(f: MediaFacts): Check[] {
  const quick = quickChecks(f);
  const typeOk = quick.format?.state === "pass";
  const results: Partial<Record<CheckId, Result>> = {
    ...quick,
    length: lengthCheck(f.kind, typeOk ? f.durationS : null),
    ...(f.kind === "video" ? videoChecks(f) : voiceChecks(f)),
  };
  return CHECK_ORDER[f.kind].map((id) => {
    const r = results[id] ?? warn("Not checked.");
    return { id, label: LABELS[id], state: r.state, detail: r.detail };
  });
}

export type Verdict = "pass" | "warn" | "fail";

export function verdict(checks: Pick<Check, "state">[]): Verdict {
  const states = checks.map((c) => c.state);
  return states.includes("fail") ? "fail" : states.includes("warn") ? "warn" : "pass";
}
