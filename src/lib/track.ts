"use client";

import type { TrackEvent, TrackEvents } from "./track-events";

/**
 * `track(event, payload)` for the public flow (PRD 16). Events go to `window.dataLayer` in the
 * gtag format, which GA4 picks up when `NEXT_PUBLIC_GA4_ID` is set (see `Analytics`). In
 * development they are also logged to the console.
 */

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** gtag.js reads `arguments` objects from the data layer, not arrays, so this mirrors its snippet. */
export const gtag: (...args: unknown[]) => void = function () {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};

export function track<E extends TrackEvent>(event: E, payload: TrackEvents[E]) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") console.info("[track]", event, payload);
  gtag("event", event, payload);
}

/** Where the person came from, for `story_start`: the utm source, or "direct". */
export function entrySource(): string {
  if (typeof window === "undefined") return "direct";
  return new URL(window.location.href).searchParams.get("utm_source")?.slice(0, 100) || "direct";
}
