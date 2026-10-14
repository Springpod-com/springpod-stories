import "server-only";
import { writeAudit } from "../audit";
import { db } from "../db";
import { emailProvider, type EmailMessage } from "./index";

/** Sends an email and records the template name (never the address) in the audit log. Never throws. */
export async function sendLogged(storyId: string, message: EmailMessage): Promise<boolean> {
  try {
    await emailProvider().send(message);
    await writeAudit(db, { storyId, actorType: "system", action: "email_sent", payload: { template: message.template } });
    return true;
  } catch (e) {
    console.error(`Email ${message.template} failed`, e);
    await writeAudit(db, { storyId, actorType: "system", action: "email_failed", payload: { template: message.template } });
    return false;
  }
}
