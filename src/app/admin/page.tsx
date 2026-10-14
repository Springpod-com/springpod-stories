import { AdminShell } from "@/components/admin/admin-shell";
import { QueueFilters } from "@/components/admin/queue-filters";
import { QueueList } from "@/components/admin/queue-list";
import { queue } from "@/lib/server/admin";
import { requireStaffPage } from "@/lib/server/staff";
import { parseFilters } from "./queue-params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Story queue | Work Experience Stories admin", robots: { index: false } };

/** The story queue (PRD 11.1). */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage();
  const { filters, query } = parseFilters(await searchParams);
  const items = await queue(filters);
  return (
    <AdminShell staff={staff}>
      <QueueFilters />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <QueueList items={items} query={query} />
        <p className="ds-p3 hidden text-muted-foreground md:col-span-2 md:block">Choose a story to review.</p>
      </div>
    </AdminShell>
  );
}
