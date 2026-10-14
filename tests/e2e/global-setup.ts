import { execSync } from "node:child_process";

/** Staff members the admin tests sign in as (development sign-in). */
export const STAFF = { moderator: "e2e.moderator@springpod.com", content: "e2e.content@springpod.com" };

export default function globalSetup() {
  execSync(`pnpm staff:add ${STAFF.moderator} moderator E2E Moderator`, { stdio: "inherit" });
  execSync(`pnpm staff:add ${STAFF.content} content E2E Content`, { stdio: "inherit" });
}
