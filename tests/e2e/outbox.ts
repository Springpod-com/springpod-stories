import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the console email provider writes emails during end-to-end tests. */
export const OUTBOX_DIR = ".e2e-outbox";

/** The newest confirm link emailed to `to`, as a path. */
export function confirmLinkFor(to: string): string | null {
  let files: string[] = [];
  try {
    files = readdirSync(OUTBOX_DIR).filter((f) => f.endsWith("confirm_email.json")).sort();
  } catch {
    return null;
  }
  for (const file of files.reverse()) {
    const message = JSON.parse(readFileSync(join(OUTBOX_DIR, file), "utf8")) as { to: string; text: string };
    if (message.to === to) return /(\/confirm\/[\w-]+)/.exec(message.text)?.[1] ?? null;
  }
  return null;
}
