import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { TokenPurpose } from "@/generated/prisma/client";
import type { Tx } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long each kind of link works. Parent links: 14 days (PRD 14). Confirm links: 7 days
 * (build plan M2.4). Remove links never expire in practice (Q14).
 */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  confirm_email: 7 * DAY_MS,
  edit_story: 14 * DAY_MS,
  parent_decision: 14 * DAY_MS,
  remove_story: 100 * 365 * DAY_MS,
};

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Creates a single-use link token. Only its hash is stored; the raw value goes in the email. */
export async function createToken(
  tx: Tx,
  { purpose, storyId, submitterId }: { purpose: TokenPurpose; storyId?: string; submitterId?: string },
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await tx.token.create({
    data: {
      tokenHash: hashToken(raw),
      purpose,
      storyId,
      submitterId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  });
  return raw;
}

export type TokenCheck =
  | { ok: true; token: { id: string; storyId: string | null; submitterId: string | null }; firstUse: boolean }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Looks up a token and marks it used. A second visit to a used link still succeeds
 * (firstUse: false), so email scanners that open links first don't lock people out.
 */
export async function useToken(tx: Tx, raw: string, purpose: TokenPurpose): Promise<TokenCheck> {
  const token = await tx.token.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.purpose !== purpose) return { ok: false, reason: "not_found" };
  if (token.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (token.usedAt) return { ok: true, token, firstUse: false };
  await tx.token.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  return { ok: true, token, firstUse: true };
}
