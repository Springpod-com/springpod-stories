"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import type { TrustLabel } from "@/generated/prisma/client";
import { generateContentPack } from "@/lib/server/content-pack";
import { markPublished } from "@/lib/server/publishing";
import * as review from "@/lib/server/review";
import { currentStaff } from "@/lib/server/staff";

/**
 * The admin's actions. Each one checks the signed-in staff member again (the proxy is only the
 * first check), then calls the review service, which applies the rules on the server.
 */

type Result = { ok: true } | { ok: false; problem: string };

async function asStaff(storyId: string, run: (staff: NonNullable<Awaited<ReturnType<typeof currentStaff>>>) => Promise<review.ActionResult>): Promise<Result> {
  const staff = await currentStaff();
  if (!staff) return { ok: false, problem: "Sign in again." };
  const result = await run(staff);
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/stories/${storyId}`);
  return result.ok ? { ok: true } : { ok: false, problem: result.problem };
}

export const setCheckAction = async (storyId: string, itemId: string, checked: boolean) =>
  asStaff(storyId, (s) => review.setCheck(s, storyId, itemId, checked));

export const approveAction = async (storyId: string) => asStaff(storyId, (s) => review.approve(s, storyId));

export const requestChangesAction = async (storyId: string, message: string) =>
  asStaff(storyId, (s) => review.requestChanges(s, storyId, message));

export const rejectAction = async (storyId: string, reason: string) => asStaff(storyId, (s) => review.reject(s, storyId, reason));

export const clearSafeguardingAction = async (storyId: string) => asStaff(storyId, (s) => review.clearSafeguarding(s, storyId));

export const resendParentAction = async (storyId: string) => asStaff(storyId, (s) => review.resendParent(s, storyId));

export const setTrustAction = async (storyId: string, trust: TrustLabel) => asStaff(storyId, (s) => review.setTrust(s, storyId, trust));

export const resolveFlagAction = async (storyId: string, flagId: string) => asStaff(storyId, (s) => review.resolveFlag(s, flagId));

export async function signOutAction() {
  await signOut({ redirectTo: "/admin/sign-in" });
}

export async function generateContentPackAction(storyId: string): Promise<Result & { fallback?: boolean }> {
  const staff = await currentStaff();
  if (!staff) return { ok: false, problem: "Sign in again." };
  const result = await generateContentPack(staff, storyId);
  revalidatePath(`/admin/stories/${storyId}`);
  return result;
}

export async function markPublishedAction(storyId: string, url: string): Promise<Result> {
  const staff = await currentStaff();
  if (!staff) return { ok: false, problem: "Sign in again." };
  const result = await markPublished(staff, storyId, url);
  revalidatePath(`/admin/stories/${storyId}`);
  return result;
}
