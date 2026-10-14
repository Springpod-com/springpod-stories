// The media worker (PRD 7.2). Run with `pnpm worker`. Needs ffmpeg and ffprobe on the PATH.
// Runs under the "react-server" condition so the app's server-only modules load outside Next.js.
import "dotenv/config";
import { jobBoss, QUEUES, type MediaJob } from "@/lib/server/jobs";
import { giveUp, processMedia, transcribeMedia } from "@/lib/server/media-jobs";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);

async function main() {
  const boss = await jobBoss({ worker: true });

  for (const [queue, run] of [
    [QUEUES.process, (id: string) => processMedia(id)],
    [QUEUES.transcribe, (id: string) => transcribeMedia(id)],
  ] as const) {
    await boss.work(queue, { localConcurrency: CONCURRENCY, includeMetadata: true }, async ([job]) => {
      if (!job) return;
      const { mediaId } = job.data as MediaJob;
      const started = Date.now();
      try {
        const outcome = await run(mediaId);
        console.log(JSON.stringify({ queue, mediaId: mediaId, outcome, ms: Date.now() - started }));
      } catch (e) {
        console.error(JSON.stringify({ queue, mediaId: mediaId, attempt: job.retryCount + 1, error: String(e) }));
        if (job.retryCount >= job.retryLimit) await giveUp(queue, mediaId);
        throw e;
      }
    });
  }
  console.log(`Media worker running (${CONCURRENCY} at a time per queue)`);

  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
