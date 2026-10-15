// Display helpers shared by the quote card and the flow. Ported from the prototype.

import { NOW_OPTIONS } from "./options";
import { firstName, isWorking, type FlowState } from "./state";

export type TrustLabel = "verified" | "community";

export const TRUST_LABEL_TEXT: Record<TrustLabel, string> = {
  verified: "Verified by Springpod",
  community: "Community story",
};

/**
 * Preview label in the public flow only (build plan Q1, default accepted):
 * Springpod students see "Verified by Springpod" in the preview. The stored and
 * published label is set on the server after the email is matched (PRD 10.2).
 */
export const previewTrust = (s: FlowState): TrustLabel => (s.who === "springpod" ? "verified" : "community");

export function displayName(s: FlowState): string {
  const name = firstName(s) || "Anonymous";
  if (s.display === "initial") return `${name.charAt(0).toUpperCase()}.`;
  if (s.display === "anon") return "Anonymous";
  return name;
}

/** "Then" and optional "now" lines for the quote card footer. */
export function cardLines(s: FlowState): { then: string; now?: string } {
  if (isWorking(s) && s.nowRole.trim()) {
    const company = s.nowCo.trim() && s.showCo ? ` at ${s.nowCo.trim()}` : "";
    return { then: `${s.role || s.expType} work experience`, now: `${s.nowRole.trim()}${company}` };
  }
  const status = NOW_OPTIONS.find((o) => o.value === s.nowStatus);
  const nowPart =
    status && status.value !== "other" ? ` · now ${status.label.replace(/^At /, "at ").replace(/^On /, "on ")}` : "";
  return { then: `${s.expType}${s.role ? ` · ${s.role}` : ""}${nowPart}` };
}

/** The "what they do now" text used in AI prompts. */
export function nowText(s: FlowState): string {
  if (isWorking(s)) {
    const kind = s.nowStatus === "apprentice" ? "apprentice" : "working";
    return `${kind} as ${s.nowRole || "unknown role"}${s.nowCo ? ` at ${s.nowCo}` : ""}${s.nowInd ? ` (${s.nowInd})` : ""}`;
  }
  return NOW_OPTIONS.find((o) => o.value === s.nowStatus)?.label ?? "not given";
}
