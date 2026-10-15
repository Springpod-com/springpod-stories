import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Staff } from "@/lib/staff";
import { db } from "./db";

export type { Staff, StaffRole } from "@/lib/staff";

/**
 * The signed-in staff member, checked against the StaffUser table on every request so that
 * deactivating someone takes effect straight away. Null if not signed in or not active.
 */
export async function currentStaff(): Promise<Staff | null> {
  const session = await auth();
  const id = session?.staff?.id;
  if (!id) return null;
  const staff = await db.staffUser.findFirst({ where: { id, active: true } });
  return staff ? { id: staff.id, email: staff.email, name: staff.name, role: staff.role } : null;
}

/** For admin pages: sends anyone who isn't active staff to the sign-in page. */
export async function requireStaffPage(): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) redirect("/admin/sign-in");
  return staff;
}

