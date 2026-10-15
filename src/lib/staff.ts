// Staff identity shared by the admin services. No auth code here, so services and tests can use it.

export type StaffRole = "moderator" | "content";

export interface Staff {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
}

/** A display name for audit and checklist entries. Never an email address. */
export const staffLabel = (s: Pick<Staff, "name" | "id">) => s.name?.trim() || `Staff ${s.id.slice(-4)}`;
