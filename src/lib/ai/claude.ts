import "server-only";
import { anthropic } from "./client";
import type { Generate } from "./interview";

/** Raised when the model declines (stop_reason "refusal"). Haiku-class models have no server-side fallback. */
export class RefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Model declined (${category ?? "no category"})`);
    this.name = "RefusalError";
  }
}

/**
 * A streaming text generator for short chat turns. Low effort keeps the reply quick;
 * the time limit covers the whole turn.
 */
export function claudeChat(model: string, { maxTokens = 1024, timeoutMs = 20_000 } = {}): Generate {
  return async function* ({ system, messages }) {
    const stream = anthropic().messages.stream(
      { model, max_tokens: maxTokens, system, messages, output_config: { effort: "low" } },
      { timeout: timeoutMs },
    );
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") throw new RefusalError(final.stop_details?.category ?? null);
    } finally {
      // Stop the request if the caller stops reading (for example the person closed the page).
      stream.abort();
    }
  };
}
