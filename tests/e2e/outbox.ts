import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the console email provider writes emails during end-to-end tests. */
export const OUTBOX_DIR = ".e2e-outbox";

/** The newest link to `path` in an email of `template` sent to `to`, as a path. */
function linkFor(template: string, path: string, to: string): string | null {
  let files: string[] = [];
  try {
    files = readdirSync(OUTBOX_DIR).filter((f) => f.endsWith(`${template}.json`)).sort();
  } catch {
    return null;
  }
  for (const file of files.reverse()) {
    const message = JSON.parse(readFileSync(join(OUTBOX_DIR, file), "utf8")) as { to: string; text: string };
    if (message.to === to) return new RegExp(`(/${path}/[\\w-]+)`).exec(message.text)?.[1] ?? null;
  }
  return null;
}

export const confirmLinkFor = (to: string) => linkFor("confirm_email", "confirm", to);
export const parentLinkFor = (to: string) => linkFor("parent_consent", "parent", to);
