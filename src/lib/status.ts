// Story lifecycle (PRD 10.1, build plan section 8). Pure: no database, no framework.
// Every transition is checked here so the API, the worker and the admin cannot disagree.

import type { StoryStatus } from "@/generated/prisma/enums";

export type StoryEvent =
  | "submit"
  | "prescreen_clear"
  | "safeguarding_flag"
  | "safeguarding_cleared"
  | "email_confirmed"
  | "parent_approved"
  | "parent_declined"
  | "approve"
  | "request_changes"
  | "reject"
  | "resubmit"
  | "withdraw";

export interface TransitionContext {
  /** True while a 14 to 17 year old's parent or carer has not yet decided. */
  parentPending?: boolean;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: StoryStatus,
    readonly event: StoryEvent,
  ) {
    super(`Cannot apply "${event}" to a story that is ${from}`);
    this.name = "InvalidTransitionError";
  }
}

/** Statuses a story can be withdrawn from: anything the person has sent us. */
const WITHDRAWABLE: StoryStatus[] = [
  "submitted",
  "awaiting_email",
  "awaiting_parent",
  "in_review",
  "approved",
  "changes_requested",
  "rejected",
  "safeguarding_review",
];

type Rule = (ctx: TransitionContext) => StoryStatus;

const RULES: Partial<Record<StoryStatus, Partial<Record<StoryEvent, Rule>>>> = {
  draft: {
    submit: () => "submitted",
  },
  submitted: {
    prescreen_clear: () => "awaiting_email",
    safeguarding_flag: () => "safeguarding_review",
  },
  awaiting_email: {
    email_confirmed: (ctx) => (ctx.parentPending ? "awaiting_parent" : "in_review"),
    // A parent can answer before the young person confirms their email. Approval is
    // recorded on the consent and takes effect at confirmation; a decline ends it.
    parent_approved: () => "awaiting_email",
    parent_declined: () => "rejected",
    safeguarding_flag: () => "safeguarding_review",
  },
  awaiting_parent: {
    parent_approved: () => "in_review",
    parent_declined: () => "rejected",
    // The team can review while consent is pending, but never approve (PRD 11.2).
    request_changes: () => "changes_requested",
    reject: () => "rejected",
    safeguarding_flag: () => "safeguarding_review",
  },
  in_review: {
    approve: () => "approved",
    request_changes: () => "changes_requested",
    reject: () => "rejected",
    safeguarding_flag: () => "safeguarding_review",
  },
  changes_requested: {
    resubmit: () => "submitted",
  },
  safeguarding_review: {
    safeguarding_cleared: (ctx) => (ctx.parentPending ? "awaiting_parent" : "in_review"),
    reject: () => "rejected",
  },
};

export function nextStatus(from: StoryStatus, event: StoryEvent, ctx: TransitionContext = {}): StoryStatus {
  if (event === "withdraw") {
    if (WITHDRAWABLE.includes(from)) return "withdrawn";
    throw new InvalidTransitionError(from, event);
  }
  const rule = RULES[from]?.[event];
  if (!rule) throw new InvalidTransitionError(from, event);
  return rule(ctx);
}

export function canTransition(from: StoryStatus, event: StoryEvent): boolean {
  try {
    nextStatus(from, event);
    return true;
  } catch {
    return false;
  }
}
