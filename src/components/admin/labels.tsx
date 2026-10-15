import { Badge } from "@springpod/design-system/components/ui/badge";
import type { StoryStatus, TrustLabel } from "@/generated/prisma/enums";
import { TRUST_LABEL_TEXT } from "@/flow/display";

/**
 * Status chips for the queue and the detail. "In review", "Approved" and "Changes requested" are
 * from the prototype; COPY GAP G12: the other labels are placeholders.
 */
export const STATUS: Record<StoryStatus, { label: string; variant: "default" | "warning" | "success" | "secondary" | "outline" | "destructive" | "info" }> = {
  draft: { label: "Draft", variant: "outline" },
  submitted: { label: "Being checked", variant: "secondary" },
  awaiting_email: { label: "Waiting for email", variant: "secondary" },
  awaiting_parent: { label: "Waiting for parent", variant: "secondary" },
  in_review: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  changes_requested: { label: "Changes requested", variant: "info" },
  rejected: { label: "Rejected", variant: "destructive" },
  safeguarding_review: { label: "Safeguarding review", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

export function StatusBadge({ status }: { status: StoryStatus }) {
  return (
    <Badge variant={STATUS[status].variant} data-status={status}>
      {STATUS[status].label}
    </Badge>
  );
}

/** "Verified Springpod experience" is the prototype's admin wording; the card says "Verified by Springpod". */
export function TrustBadge({ trust }: { trust: TrustLabel }) {
  return <Badge variant={trust === "verified" ? "info" : "outline"}>{trust === "verified" ? "Verified Springpod experience" : TRUST_LABEL_TEXT.community}</Badge>;
}

export const FORMAT_LABEL = { interview: "Interview", write: "Written", voice: "Voice note", video: "Video" } as const;
