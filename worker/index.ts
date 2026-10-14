// The worker (PRD 7.2, 9.4): media checks and transcripts, and the story pre-screen. Run with
// `pnpm worker`. Needs ffmpeg and ffprobe on the PATH. Runs under the "react-server" condition so
// the app's server-only modules load outside Next.js.
import "dotenv/config";
import { GIVE_UP, HANDLERS } from "@/lib/server/job-handlers";
import { jobBoss, type JobData, type QueueName } from "@/lib/server/jobs";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);

async function main() {
  const boss = await jobBoss({ worker: true });

  for (const queue of Object.keys(HANDLERS) as QueueName[]) {
    const run = HANDLERS[queue] as (data: JobData[QueueName]) => Promise<string>;
    const giveUp = GIVE_UP[queue] as ((data: JobData[QueueName]) => Promise<void>) | undefined;
    await boss.work(queue, { localConcurrency: CONCURRENCY, includeMetadata: true }, async ([job]) => {
      if (!job) return;
      const data = job.data as JobData[QueueName];
      const started = Date.now();
      try {
        const outcome = await run(data);
        console.log(JSON.stringify({ queue, ...data, outcome, ms: Date.now() - started }));
      } catch (e) {
        console.error(JSON.stringify({ queue, ...data, attempt: job.retryCount + 1, error: String(e) }));
        if (job.retryCount >= job.retryLimit) await giveUp?.(data);
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
