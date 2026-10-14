import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Model choice (docs/ai-prompts.md): a fast Haiku-class model for interview turns, a
 * balanced Sonnet-class model for drafting, the content pack and the pre-screen.
 * Overridable per environment without a code change.
 */
export const MODELS = {
  fast: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
  balanced: process.env.AI_MODEL_BALANCED ?? "claude-sonnet-5-5",
};

let client: Anthropic | null = null;

/** True when an API key is configured. Without one, every AI feature uses its documented fallback. */
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * The one place the SDK client is made. If Claude is reached through Amazon Bedrock instead
 * (an open infrastructure decision), this is the only function that changes.
 */
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 1 });
  return client;
}
