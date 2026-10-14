// Request and response shapes for the media API, shared by the browser and the server.

import { z } from "zod";
import { CHECK_ORDER, type Check, type MediaKind } from "./checks";

const checkIds = [...new Set([...CHECK_ORDER.video, ...CHECK_ORDER.voice])] as [string, ...string[]];

export const checkSchema = z.object({
  id: z.enum(checkIds),
  label: z.string().max(40),
  state: z.enum(["pass", "warn", "fail", "pending"]),
  detail: z.string().max(300),
});

export const createMediaSchema = z.object({
  kind: z.enum(["voice", "video"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().positive(),
});
export type CreateMedia = z.infer<typeof createMediaSchema>;

export const partUrlsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(50),
});

export const completeSchema = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(200) }))
    .min(1)
    .max(10000),
});

/** Transcripts are short: about 450 words at most for a 3 minute voice note. */
export const MAX_TRANSCRIPT_CHARS = 6000;

export const updateMediaSchema = z.object({
  facts: z
    .object({
      durationS: z.number().positive().max(24 * 60 * 60).nullable(),
      width: z.number().int().positive().max(20000).nullable(),
      height: z.number().int().positive().max(20000).nullable(),
    })
    .optional(),
  browserChecks: z.array(checkSchema).max(10).optional(),
  transcript: z.string().max(MAX_TRANSCRIPT_CHARS).optional(),
});
export type UpdateMedia = z.infer<typeof updateMediaSchema>;

export type MediaStatus = "uploading" | "uploaded" | "processing" | "ready" | "failed" | "deleted";

export interface CreatedMedia {
  mediaId: string;
  partSize: number;
  partCount: number;
}

/** What the browser sees about an uploaded file. */
export interface MediaView {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  durationS: number | null;
  /** What the browser found when the file was chosen. */
  browserChecks: Check[] | null;
  /** The server's own checks (PRD 7.2), once processed. */
  serverChecks: Check[] | null;
  /** Null until transcription finishes. The person's edit wins over the raw text. */
  transcript: string | null;
  transcriptEdited: boolean;
  /** Signed, short-lived link for playback. Null while uploading. */
  playbackUrl: string | null;
  posterUrl: string | null;
}
