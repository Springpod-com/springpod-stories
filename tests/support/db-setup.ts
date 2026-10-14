import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.EMAIL_PROVIDER = "console";
process.env.EMAIL_OUTBOX_DIR = mkdtempSync(join(tmpdir(), "wes-outbox-"));
process.env.APP_URL = "http://localhost:3000";
process.env.S3_BUCKET = "wes-media-test";

const { db } = await import("@/lib/server/db");

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "AuditEvent", "Token", "Asset", "Review", "Flag", "Media", "InterviewTurn", "Consent", "Story", "Submitter", "BlockedCount", "StaffUser" CASCADE',
  );
});

afterAll(async () => {
  await db.$disconnect();
});
