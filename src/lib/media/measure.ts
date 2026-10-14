// Measurements shared by the browser checks and the worker, so both judge a file the same way.

import type { AudioStats } from "./checks";

/** Loudness, peak, clipping and the share of silent half-second windows. Samples are -1 to 1. */
export function audioStats(samples: Float32Array, sampleRate: number): AudioStats {
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.5));
  const step = Math.max(1, Math.floor(sampleRate / 8000));
  let peak = 0;
  let clipped = 0;
  let sumSq = 0;
  let n = 0;
  const windowDb: number[] = [];
  for (let w = 0; w < samples.length; w += windowSize) {
    let s = 0;
    let k = 0;
    for (let i = w; i < Math.min(w + windowSize, samples.length); i += step) {
      const v = samples[i]!;
      const a = Math.abs(v);
      s += v * v;
      k++;
      if (a > peak) peak = a;
      if (a > 0.985) clipped++;
    }
    sumSq += s;
    n += k;
    windowDb.push(10 * Math.log10(s / Math.max(1, k) || 1e-10));
  }
  if (peak < 0.003) return { silent: true };
  return {
    silent: false,
    rmsDb: 10 * Math.log10(sumSq / Math.max(1, n) || 1e-10),
    peak,
    clipRatio: clipped / Math.max(1, n),
    silentRatio: windowDb.filter((d) => d < -45).length / Math.max(1, windowDb.length),
  };
}

/** Average perceived brightness (0 to 255) of RGB or RGBA pixels. */
export function lumaAverage(data: ArrayLike<number>, channels: 3 | 4): number {
  let sum = 0;
  for (let i = 0; i + 2 < data.length; i += channels) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
  return sum / Math.max(1, Math.floor(data.length / channels));
}

/** Peak level per bucket, 0 to 1, for drawing a waveform. */
export function waveformPeaks(samples: Float32Array, buckets = 200): number[] {
  const size = Math.max(1, Math.ceil(samples.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < samples.length; b += size) {
    let peak = 0;
    for (let i = b; i < Math.min(b + size, samples.length); i++) peak = Math.max(peak, Math.abs(samples[i]!));
    peaks.push(Math.round(Math.min(1, peak) * 1000) / 1000);
  }
  return peaks;
}
