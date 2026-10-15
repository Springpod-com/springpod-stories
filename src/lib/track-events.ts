/**
 * The tracking events from PRD 16 and what each may carry. Every value is a fixed option, a
 * count or an id from the question config: free text has no field to go in.
 */
export interface TrackEvents {
  story_start: { source: string };
  question_answered: { question: string; chapter: string; value?: string };
  story_blocked_under14: Record<string, never>;
  mode_selected: { value: string };
  format_selected: { value: string };
  /** `failed` lists the failed check ids, comma separated (GA4 takes flat values). */
  media_checks_result: { format: "voice" | "video"; verdict: "pass" | "warn" | "fail"; failed: string };
  media_retry: { format: "voice" | "video"; reason: "fail" | "warn" | "pass" | "different_file" | "film_again" };
  draft_generated: Record<string, never>;
  draft_regenerated: Record<string, never>;
  /** 0, 1 or 2 for the suggested quotes, or "custom". */
  quote_selected: { option: string };
  story_submitted: { mode: string; format: string; age_band: string; channels: number };
  email_confirmed: Record<string, never>;
  parent_decision: { decision: string };
  admin_status_changed: { status: string };
  /** The asset kinds made, comma separated. */
  content_pack_generated: { kinds: string };
}

export type TrackEvent = keyof TrackEvents;
