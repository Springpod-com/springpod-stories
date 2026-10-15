import "server-only";
import type { TrackEvent, TrackEvents } from "@/lib/track-events";

/**
 * Server-side events (email confirmed, parent decision, admin and content pack). Logged in
 * development; sent to GA4 through the Measurement Protocol when `GA4_MEASUREMENT_ID` and
 * `GA4_API_SECRET` are set. The story id stands in for GA's client id, so nothing personal is sent.
 * Never throws and never holds up the caller.
 */

type Fetch = typeof fetch;

export function trackServer<E extends TrackEvent>(storyId: string, event: E, payload: TrackEvents[E], send: Fetch = fetch): Promise<void> {
  if (process.env.NODE_ENV === "development") console.info("[track]", event, payload);
  const id = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  if (!id || !secret) return Promise.resolve();
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`;
  return send(url, {
    method: "POST",
    body: JSON.stringify({ client_id: storyId, events: [{ name: event, params: payload }] }),
    signal: AbortSignal.timeout(2000),
  }).then(
    () => undefined,
    (e: unknown) => console.error("Tracking failed", e instanceof Error ? e.message : e),
  );
}
