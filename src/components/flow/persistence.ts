"use client";

import { useEffect, useRef } from "react";
import type { Draft, FlowState } from "@/flow/state";
import { initialState } from "@/flow/state";
import { pickDraftAnswers } from "@/lib/story-data";

const AUTOSAVE_DELAY_MS = 600;

/** The saved draft for this device, if there is one. */
export async function loadDraft(): Promise<FlowState | null> {
  try {
    const res = await fetch("/api/draft", { cache: "no-store" });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { state: FlowState };
    return { ...initialState, ...body.state };
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  await fetch("/api/draft", { method: "DELETE" }).catch(() => undefined);
}

/**
 * Saves answers a moment after they change (PRD 4 rule 5). Nothing is sent until an age is
 * chosen; the server stores nothing at all for under 14s. Contact details and consent are
 * never autosaved: they go to the server once, at submit.
 */
export function useAutosave(state: FlowState, enabled: boolean) {
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !state.age) return;
    const body = JSON.stringify(pickDraftAnswers(state));
    if (body === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = body;
      fetch("/api/draft", { method: "PUT", headers: { "content-type": "application/json" }, body }).catch(() => {
        // Offline or failed: try again on the next change.
        lastSent.current = null;
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, enabled]);
}

/** COPY GAP G18: error messages for a failed submit are placeholders. */
const SUBMIT_FAILED = "We couldn't send your story. Check your connection and try again.";
const RATE_LIMITED = "Too many tries. Wait a little while, then try again.";

/** Sends the finished story. Returns an error message to show, or null on success. */
export async function submitStory(state: FlowState): Promise<string | null> {
  try {
    const res = await fetch("/api/story/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...pickDraftAnswers(state),
        channels: state.channels,
        email: state.email,
        parentEmail: state.parentEmail,
        terms: state.terms,
        marketing: state.marketing,
      }),
    });
    if (res.ok) return null;
    if (res.status === 429) return RATE_LIMITED;
    if (res.status === 422) {
      const body = (await res.json()) as { message?: string };
      return body.message ?? SUBMIT_FAILED;
    }
    return SUBMIT_FAILED;
  } catch {
    return SUBMIT_FAILED;
  }
}

/** COPY GAP G6 and G17: placeholders for when the draft can't be written. */
const DRAFT_FAILED = "We couldn't write up your story. Check your connection and try again.";

export type DraftResponse = { draft: Draft; previousDraft: Draft | null; fallback: boolean } | { message: string };

/** Asks the server to write up the story, or to try a different version. */
export async function writeDraftRequest(state: FlowState, different: boolean): Promise<DraftResponse> {
  try {
    const res = await fetch("/api/draft/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: pickDraftAnswers(state), different }),
    });
    if (res.ok) return (await res.json()) as DraftResponse;
    return { message: res.status === 429 ? RATE_LIMITED : DRAFT_FAILED };
  } catch {
    return { message: DRAFT_FAILED };
  }
}
