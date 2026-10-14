import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
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

/**
 * A single structured call: the reply must match `schema` (structured outputs), and the parsed
 * object is returned. Used for the story draft, on the balanced model.
 */
export function claudeJson<T extends z.ZodType>(
  model: string,
  schema: T,
  { maxTokens = 8000, timeoutMs = 60_000, effort = "medium" as "low" | "medium" | "high" } = {},
) {
  return async (prompt: string): Promise<z.infer<T>> => {
    const res = await anthropic().messages.parse(
      {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort, format: zodOutputFormat(schema) },
      },
      { timeout: timeoutMs },
    );
    if (res.stop_reason === "refusal") throw new RefusalError(res.stop_details?.category ?? null);
    if (res.parsed_output == null) throw new Error(`No usable reply (stop reason ${res.stop_reason})`);
    return res.parsed_output;
  };
}
