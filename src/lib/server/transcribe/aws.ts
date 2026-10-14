import "server-only";
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import { deleteObjects, getObjectText, storageBucket } from "../storage";
import { parseAwsTranscript } from "./parse-aws";
import type { Transcriber } from "./types";

const POLL_MS = 3000;
const MAX_WAIT_MS = 15 * 60_000;

/**
 * Amazon Transcribe in the same UK region as the bucket. The job reads the WAV from the bucket and
 * writes its output next to it; both the job and the output are deleted once read, so the only copy
 * of the transcript is on the media record.
 */
export function awsTranscriber(): Transcriber {
  const client = new TranscribeClient({ region: process.env.TRANSCRIBE_REGION ?? process.env.S3_REGION ?? "eu-west-2" });
  return {
    name: "aws",
    async transcribe({ key, jobId }) {
      const bucket = storageBucket();
      const name = `wes-${jobId}`;
      const outputKey = `${key.replace(/[^/]+$/, "")}transcript.json`;
      await client.send(
        new StartTranscriptionJobCommand({
          TranscriptionJobName: name,
          LanguageCode: "en-GB",
          MediaFormat: "wav",
          Media: { MediaFileUri: `s3://${bucket}/${key}` },
          OutputBucketName: bucket,
          OutputKey: outputKey,
        }),
      );
      try {
        const started = Date.now();
        for (;;) {
          const { TranscriptionJob: job } = await client.send(new GetTranscriptionJobCommand({ TranscriptionJobName: name }));
          if (job?.TranscriptionJobStatus === "COMPLETED") break;
          if (job?.TranscriptionJobStatus === "FAILED") throw new Error(`Transcription failed: ${job.FailureReason ?? "unknown"}`);
          if (Date.now() - started > MAX_WAIT_MS) throw new Error("Transcription timed out");
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        return parseAwsTranscript(JSON.parse(await getObjectText(outputKey)));
      } finally {
        await client.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: name })).catch(() => undefined);
        await deleteObjects([outputKey]).catch(() => undefined);
      }
    },
  };
}
