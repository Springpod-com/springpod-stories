import "server-only";
import { appUrl, type EmailMessage } from "./index";

// COPY GAP G14: email copy is not written yet (docs/copy-gaps.md). These placeholders carry
// the links and nothing else, so the flow can be tested end to end.

/** Every email to the young person or their parent ends with "Remove my story" (PRD 9.3, 14). */
const removeFooter = (removeToken: string) => ["", "--", `Remove my story: ${appUrl(`/remove/${removeToken}`)}`];

export function confirmEmail({ to, firstName, token, removeToken }: { to: string; firstName: string; token: string; removeToken: string }): EmailMessage {
  return {
    template: "confirm_email",
    to,
    subject: "[Copy needed G14] Confirm your email",
    text: [`[Copy needed G14] Hi ${firstName},`, "", `Confirm your email: ${appUrl(`/confirm/${token}`)}`, ...removeFooter(removeToken)].join("\n"),
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
  removeToken,
}: {
  to: string;
  firstName: string;
  headline: string;
  story: string;
  pullQuote: string;
  channels: string[];
  token: string;
  removeToken: string;
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
      ...removeFooter(removeToken),
    ].join("\n"),
  };
}

/** To the designated safeguarding lead (PRD 9.4, 14): a link to the story in the admin, no story content. */
export function safeguardingEmail({ to, storyId }: { to: string; storyId: string }): EmailMessage {
  return {
    template: "safeguarding_flag",
    to,
    subject: "[Copy needed G14] A story needs a safeguarding review",
    text: ["[Copy needed G14] A story has been held for safeguarding review.", "", `Open it in the admin: ${appUrl(`/admin/stories/${storyId}`)}`].join("\n"),
  };
}

/** To the submitter when the team asks for changes (PRD 14): the team's message and an edit link. */
export function changesRequestedEmail({
  to,
  firstName,
  message,
  token,
  removeToken,
}: {
  to: string;
  firstName: string;
  message: string;
  token: string;
  removeToken: string;
}): EmailMessage {
  return {
    template: "changes_requested",
    to,
    subject: "[Copy needed G14] A change to your story",
    text: [`[Copy needed G14] Hi ${firstName},`, "", message, "", `Edit your story: ${appUrl(`/edit/${token}`)}`, ...removeFooter(removeToken)].join("\n"),
  };
}

/** Approved (PRD 14): where it may appear, and the remove link. */
export function approvedEmail({ to, firstName, channels, removeToken }: { to: string; firstName: string; channels: string[]; removeToken: string }): EmailMessage {
  return {
    template: "approved",
    to,
    subject: "[Copy needed G14] Your story is approved",
    text: [`[Copy needed G14] Hi ${firstName}, your story is approved.`, "", `Where it may appear: ${channels.join(", ")}`, ...removeFooter(removeToken)].join("\n"),
  };
}

/** Published (PRD 14, sent from the admin): the link to share and the quote card download. */
export function publishedEmail({
  to,
  firstName,
  url,
  cardUrl,
  removeToken,
}: {
  to: string;
  firstName: string;
  url: string;
  cardUrl: string | null;
  removeToken: string;
}): EmailMessage {
  return {
    template: "published",
    to,
    subject: "[Copy needed G14] Your story is live",
    text: [
      `[Copy needed G14] Hi ${firstName}, your story is live.`,
      "",
      `Share it: ${url}`,
      ...(cardUrl ? [`Download your quote card: ${cardUrl}`] : []),
      ...removeFooter(removeToken),
    ].join("\n"),
  };
}
