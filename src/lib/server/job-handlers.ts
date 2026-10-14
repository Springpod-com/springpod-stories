import "server-only";
import type { JobData, QueueName } from "./jobs";
import { giveUp, processMedia, transcribeMedia } from "./media-jobs";
import { runPrescreen } from "./prescreen";

/** What runs each job, for the worker (and inline in tests). Returns a short outcome for the log. */
export const HANDLERS: { [Q in QueueName]: (data: JobData[Q]) => Promise<string> } = {
  "media-process": ({ mediaId }) => processMedia(mediaId),
  "media-transcribe": ({ mediaId }) => transcribeMedia(mediaId),
  "story-prescreen": ({ storyId }) => runPrescreen(storyId),
};

/** After the last retry. */
export const GIVE_UP: { [Q in QueueName]?: (data: JobData[Q]) => Promise<void> } = {
  "media-process": ({ mediaId }) => giveUp("media-process", mediaId),
  "media-transcribe": ({ mediaId }) => giveUp("media-transcribe", mediaId),
};

export function runJob<Q extends QueueName>(queue: Q, data: JobData[Q]): Promise<string> {
  return (HANDLERS[queue] as (d: JobData[Q]) => Promise<string>)(data);
}
