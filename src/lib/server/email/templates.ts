import "server-only";
import { appUrl, type EmailMessage } from "./index";

// COPY GAP G14: email copy is not written yet (docs/copy-gaps.md). These placeholders carry
// the links and nothing else, so the flow can be tested end to end.

export function confirmEmail({ to, firstName, token }: { to: string; firstName: string; token: string }): EmailMessage {
  return {
    template: "confirm_email",
    to,
    subject: "[Copy needed G14] Confirm your email",
    text: [`[Copy needed G14] Hi ${firstName},`, "", `Confirm your email: ${appUrl(`/confirm/${token}`)}`].join("\n"),
  };
}

/**
 * To a parent or carer of a 14 to 17 year old (PRD 14): who sent it, the story and quote, the
 * channels chosen, and the link to decide. The link works for 14 days.
 */
export function parentConsentEmail({
  to,
  firstName,
  headline,
  story,
  pullQuote,
  channels,
  token,
}: {
  to: string;
  firstName: string;
  headline: string;
  story: string;
  pullQuote: string;
  channels: string[];
  token: string;
}): EmailMessage {
  return {
    template: "parent_consent",
    to,
    subject: `[Copy needed G14] ${firstName} would like to share their work experience story`,
    text: [
      "[Copy needed G14] Introduction for the parent or carer.",
      "",
      headline,
      "",
      story,
      "",
      `Quote: "${pullQuote}"`,
      `Where it may appear: ${channels.join(", ")}`,
      "",
      `Approve, approve without their name, or decline: ${appUrl(`/parent/${token}`)}`,
    ].join("\n"),
  };
}
