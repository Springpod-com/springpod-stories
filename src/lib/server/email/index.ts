import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface EmailMessage {
  /** Template name, recorded in the audit log instead of the address. */
  template: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * PLACEHOLDER (PRD section 21): the email provider is not chosen yet. The console provider
 * logs each email (and, when EMAIL_OUTBOX_DIR is set, writes it to a file for tests).
 */
const consoleProvider: EmailProvider = {
  async send(message) {
    // The address is masked so it never lands in logs in full.
    console.info(`[email] ${message.template} -> ${maskEmail(message.to)}\n${message.subject}\n\n${message.text}`);
    const dir = process.env.EMAIL_OUTBOX_DIR;
    if (dir) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${Date.now()}-${message.template}.json`), JSON.stringify(message, null, 2));
    }
  },
};

export function maskEmail(address: string): string {
  const [user = "", domain = ""] = address.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export function emailProvider(): EmailProvider {
  const name = process.env.EMAIL_PROVIDER ?? "console";
  if (name === "console") return consoleProvider;
  throw new Error(`Unknown EMAIL_PROVIDER: ${name}`);
}

export const appUrl = (path: string) => new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
