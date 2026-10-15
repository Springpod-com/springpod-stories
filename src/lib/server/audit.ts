import "server-only";
import type { ActorType, Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

interface AuditInput {
  storyId: string | null;
  actorType: ActorType;
  /** Staff id when a staff member acted. Never an email address. */
  actorId?: string | null;
  action: string;
  payload?: Prisma.InputJsonValue;
}

/** Every state change on a story writes one of these, in the same transaction (PRD 4 rule 4). */
export function writeAudit(tx: Tx, { storyId, actorType, actorId = null, action, payload }: AuditInput) {
  return tx.auditEvent.create({ data: { storyId, actorType, actorId, action, payload } });
}
