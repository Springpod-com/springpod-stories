import { describe, expect, it } from "vitest";
import { canTransition, InvalidTransitionError, nextStatus } from "./status";

describe("story status transitions (PRD 10.1)", () => {
  it("follows the happy path for an adult", () => {
    expect(nextStatus("draft", "submit")).toBe("submitted");
    expect(nextStatus("submitted", "prescreen_clear")).toBe("awaiting_email");
    expect(nextStatus("awaiting_email", "email_confirmed")).toBe("in_review");
    expect(nextStatus("in_review", "approve")).toBe("approved");
  });

  it("waits for a parent or carer for 14 to 17 year olds", () => {
    expect(nextStatus("awaiting_email", "email_confirmed", { parentPending: true })).toBe("awaiting_parent");
    expect(nextStatus("awaiting_parent", "parent_approved")).toBe("in_review");
    expect(nextStatus("awaiting_parent", "parent_declined")).toBe("rejected");
  });

  it("never approves while parent consent is pending (acceptance criterion 3)", () => {
    expect(() => nextStatus("awaiting_parent", "approve")).toThrow(InvalidTransitionError);
    expect(canTransition("awaiting_parent", "request_changes")).toBe(true);
  });

  it("keeps a parent's early approval waiting for the email confirmation", () => {
    expect(nextStatus("awaiting_email", "parent_approved")).toBe("awaiting_email");
    expect(nextStatus("awaiting_email", "parent_declined")).toBe("rejected");
  });

  it("routes safeguarding concerns out of the normal queue and back", () => {
    expect(nextStatus("submitted", "safeguarding_flag")).toBe("safeguarding_review");
    expect(nextStatus("in_review", "safeguarding_flag")).toBe("safeguarding_review");
    expect(() => nextStatus("safeguarding_review", "approve")).toThrow(InvalidTransitionError);
    expect(nextStatus("safeguarding_review", "safeguarding_cleared", { parentPending: true })).toBe("awaiting_parent");
    expect(nextStatus("safeguarding_review", "safeguarding_cleared")).toBe("in_review");
    expect(nextStatus("safeguarding_review", "safeguarding_cleared", { emailPending: true, parentPending: true })).toBe("awaiting_email");
  });

  it("sends changed stories back through the checks", () => {
    expect(nextStatus("in_review", "request_changes")).toBe("changes_requested");
    expect(nextStatus("changes_requested", "resubmit")).toBe("submitted");
  });

  it("lets anything that was sent be withdrawn, but not a draft or a withdrawn story", () => {
    for (const s of ["submitted", "awaiting_email", "awaiting_parent", "in_review", "approved", "rejected"] as const) {
      expect(nextStatus(s, "withdraw")).toBe("withdrawn");
    }
    expect(canTransition("draft", "withdraw")).toBe(false);
    expect(canTransition("withdrawn", "withdraw")).toBe(false);
  });

  it("refuses anything else", () => {
    expect(canTransition("draft", "approve")).toBe(false);
    expect(canTransition("approved", "submit")).toBe(false);
    expect(canTransition("rejected", "approve")).toBe(false);
  });
});
