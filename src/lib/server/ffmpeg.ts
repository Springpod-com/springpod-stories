import "server-only";
import { spawn } from "node:child_process";

/** Wrappers round ffprobe and ffmpeg for the media worker (PRD 7.2). Both must be on the PATH. */

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const TIMEOUT_MS = 10 * 60_000;

function run(cmd: string, args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      // Keep the tail only: summaries are printed last.
      stderr = (stderr + d.toString()).slice(-20000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`${cmd} exited with ${code}: ${stderr.slice(-500)}`));
    });
  });
}

const ffmpeg = (args: string[]) => run(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args]);

export interface Probe {
  container: string;
  durationS: number | null;
  video: { codec: string; width: number; height: number; rotation: number } | null;
  audio: { codec: string } | null;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

/** Container, codecs, duration, displayed size (after rotation) and whether there is sound. */
export async function probe(path: string): Promise<Probe> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
  const json = JSON.parse(stdout.toString()) as { format?: { format_name?: string; duration?: string }; streams?: ProbeStream[] };
  const streams = json.streams ?? [];
  // Cover art in an audio file shows up as a video stream; it isn't one.
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");
  const rotation = Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0);
  const sideways = Math.abs(rotation) % 180 === 90;
  const duration = Number(json.format?.duration ?? v?.duration ?? NaN);
  return {
    container: json.format?.format_name ?? "unknown",
    durationS: Number.isFinite(duration) && duration > 0 ? duration : null,
    video:
      v && v.width && v.height
        ? { codec: v.codec_name ?? "unknown", width: sideways ? v.height : v.width, height: sideways ? v.width : v.height, rotation }
        : null,
    audio: a ? { codec: a.codec_name ?? "unknown" } : null,
  };
}

/** The soundtrack as mono floats, -1 to 1. */
export async function decodeAudio(path: string, sampleRate: number, maxS: number): Promise<Float32Array> {
  const { stdout } = await ffmpeg(["-i", path, "-t", String(maxS), "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1"]);
  const copy = new Uint8Array(stdout).slice().buffer;
  return new Float32Array(copy, 0, Math.floor(copy.byteLength / 4));
}

/** Integrated loudness (LUFS) and true peak (dBFS), EBU R128. */
export async function loudness(path: string): Promise<{ lufs: number | null; truePeakDb: number | null }> {
  const { stderr } = await ffmpeg(["-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re: RegExp) => {
    const n = Number(re.exec(summary)?.[1]);
    return Number.isFinite(n) ? n : null;
  };
  return { lufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/), truePeakDb: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

/** One frame, scaled to `width` pixels across, as raw RGB. */
export async function frameRgb(path: string, atS: number, width: number): Promise<Buffer> {
  const { stdout } = await ffmpeg([
    "-ss", atS.toFixed(2), "-i", path, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ]);
  return stdout;
}

/** Mean blur over a frame a second (higher is blurrier). Recorded for staff; it doesn't fail a file. */
export async function blurScore(path: string, maxS: number): Promise<number | null> {
  const { stderr } = await ffmpeg(["-t", String(maxS), "-i", path, "-an", "-vf", "fps=1,scale=480:-2,blurdetect", "-f", "null", "-"]);
  const n = Number(/blur mean:\s*([\d.]+)/.exec(stderr)?.[1]);
  return Number.isFinite(n) ? n : null;
}

/** Converts for playback: H.264/AAC MP4 for video, AAC M4A for a voice note. Keeps at most `maxS` seconds. */
export async function normalise(path: string, out: string, kind: "video" | "voice", maxS: number) {
  const common = ["-i", path, "-t", String(maxS), "-map_metadata", "-1", "-movflags", "+faststart"];
  if (kind === "video") {
    await ffmpeg([
      ...common,
      "-map", "0:v:0", "-map", "0:a:0?",
      // Short side at most 1080 pixels; the phone's rotation is applied to the pixels.
      "-vf", "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2",
      "-f", "mp4", out,
    ]);
  } else {
    await ffmpeg([...common, "-vn", "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-f", "ipod", out]);
  }
}

export async function poster(path: string, out: string, atS: number) {
  await ffmpeg(["-ss", atS.toFixed(2), "-i", path, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "4", "-f", "image2", out]);
}

/** 16 kHz mono WAV for speech to text. */
export async function speechAudio(path: string, out: string, maxS: number) {
  await ffmpeg(["-i", path, "-t", String(maxS), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav", out]);
}
