import { Button } from "@springpod/design-system/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { QueueFilters } from "@/components/admin/queue-filters";
import { QueueList } from "@/components/admin/queue-list";
import { StoryDetail } from "@/components/admin/story-detail";
import { queue, storyDetail } from "@/lib/server/admin";
import { reviewState } from "@/lib/server/review";
import { requireStaffPage } from "@/lib/server/staff";
import { parseFilters } from "../../queue-params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Story | Work Experience Stories admin", robots: { index: false } };

/** The queue with one story open (PRD 11.2). On phones the list is hidden behind "Back to the queue". */
export default async function AdminStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  const { id } = await params;
  const { filters, query } = parseFilters(await searchParams);
  const [story, review, items] = await Promise.all([storyDetail(id), reviewState(id), queue(filters)]);
  if (!story || !review) notFound();
  return (
    <AdminShell staff={staff}>
      <div className="hidden md:block">
        <QueueFilters />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="hidden md:block">
          <QueueList items={items} selectedId={id} query={query} />
        </div>
        <div className="flex flex-col gap-3 md:col-span-2">
          <Button asChild variant="link" size="sm" className="self-start px-0 md:hidden">
            <Link href={`/admin${query}`}>Back to the queue</Link>
          </Button>
          <StoryDetail story={story} review={review} />
        </div>
      </div>
    </AdminShell>
  );
}
