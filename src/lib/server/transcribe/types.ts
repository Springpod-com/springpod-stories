export interface Segment {
  startS: number;
  endS: number;
  text: string;
}

export interface Transcript {
  text: string;
  /** Average word confidence, 0 to 1, when the provider gives one. */
  confidence: number | null;
  /** Timed lines, for captions and the SRT download. */
  segments: Segment[];
}

export interface Transcriber {
  name: string;
  /** `key` is the 16 kHz mono WAV in storage; `localPath` is the same file on disk. */
  transcribe(input: { key: string; localPath: string; durationS: number; jobId: string }): Promise<Transcript>;
}
