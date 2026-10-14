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
