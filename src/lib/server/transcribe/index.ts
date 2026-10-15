import "server-only";
import { awsTranscriber } from "./aws";
import { fakeTranscriber } from "./fake";
import type { Transcriber } from "./types";

export type { Segment, Transcriber, Transcript } from "./types";

/**
 * Speech to text (PRD 7.2 step 5). The provider is still to be confirmed (build plan Q15), so it
 * sits behind this interface. TRANSCRIBE_PROVIDER: "aws" (Amazon Transcribe, eu-west-2) or "fake"
 * (fixed sample text, for local development and tests; refused in production).
 */
export function transcriber(): Transcriber {
  const provider = process.env.TRANSCRIBE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "fake");
  if (provider === "aws") return awsTranscriber();
  if (provider === "fake" && process.env.NODE_ENV !== "production") return fakeTranscriber;
  throw new Error(`TRANSCRIBE_PROVIDER "${provider}" is not available here. Use "aws", or "fake" outside production.`);
}
