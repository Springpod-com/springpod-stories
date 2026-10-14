import { execSync } from "node:child_process";

/** Staff members the admin tests sign in as (development sign-in). */
export const STAFF = { moderator: "e2e.moderator@springpod.com" };

export default function globalSetup() {
  execSync(`pnpm staff:add ${STAFF.moderator} moderator E2E Moderator`, { stdio: "inherit" });
}
