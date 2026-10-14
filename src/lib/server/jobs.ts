import "server-only";
import { PgBoss } from "pg-boss";

/**
 * Background jobs (PRD 7.2) on pg-boss, which keeps its queue in the same Postgres database
 * (its own `pgboss` schema). The web app only sends jobs; `worker/index.ts` runs them.
 */
export const QUEUES = {
  /** Server checks, conversion, poster frame and waveform for one uploaded file. */
  process: "media-process",
  /** Speech to text for one processed file. */
  transcribe: "media-transcribe",
  /** The AI pre-screen of a submitted story (PRD 9.4). */
  prescreen: "story-prescreen",
  /** Quote card PNGs for the content pack and the "Published" email (PRD 12, 14). */
  quoteCards: "quote-card-render",
  /** Daily: deletes media, links and drafts that are past their time (PRD 9.3). */
  retention: "retention-sweep",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export interface MediaJob {
  mediaId: string;
}
export interface StoryJob {
  storyId: string;
}
/** What each queue's jobs carry. */
export interface JobData {
  "media-process": MediaJob;
  "media-transcribe": MediaJob;
  "story-prescreen": StoryJob;
  "quote-card-render": StoryJob;
  "retention-sweep": Record<string, never>;
}
export type SendJob = <Q extends QueueName>(queue: Q, data: JobData[Q]) => Promise<void>;

const QUEUE_OPTIONS = { retryLimit: 3, retryDelay: 10, retryBackoff: true, expireInSeconds: 15 * 60 };

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> };

/** One started pg-boss per process, with every queue created. */
export function jobBoss(options: { worker?: boolean } = {}): Promise<PgBoss> {
  globalForBoss.boss ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Only the worker runs maintenance and schedules; the web app just sends.
    const boss = new PgBoss({ connectionString, supervise: Boolean(options.worker), schedule: Boolean(options.worker) });
    boss.on("error", (e) => console.error("Job queue error", e));
    await boss.start();
    for (const name of Object.values(QUEUES)) {
      if (!(await boss.getQueue(name))) await boss.createQueue(name, QUEUE_OPTIONS);
    }
    return boss;
  })();
  return globalForBoss.boss;
}

/**
 * Queues a job for the worker. With JOBS_MODE=inline (the integration tests) the job runs straight
 * away in this process instead, so a test sees the finished result.
 */
export const sendJob: SendJob = async (queue, data) => {
  if (process.env.JOBS_MODE === "inline") {
    const { runJob } = await import("./job-handlers");
    await runJob(queue, data);
    return;
  }
  await (await jobBoss()).send(queue, data);
};
