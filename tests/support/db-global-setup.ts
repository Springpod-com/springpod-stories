import "dotenv/config";
import { execSync } from "node:child_process";

export const TEST_BUCKET = "wes-media-test";

/** Applies migrations to the test database, and creates the test bucket, once before the integration tests. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  if (!process.env.S3_ENDPOINT) throw new Error("S3_ENDPOINT is not set. Start the local S3 stand-in (see README).");
  execSync("node scripts/dev-storage.mjs", { stdio: "inherit", env: { ...process.env, S3_BUCKET: TEST_BUCKET } });
}
