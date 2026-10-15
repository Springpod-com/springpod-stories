import { Badge } from "@springpod/design-system/components/ui/badge";
import { cn } from "@springpod/design-system/lib/utils";
import Link from "next/link";
import type { QueueItem } from "@/lib/server/admin";
import { FORMAT_LABEL, StatusBadge } from "./labels";

/** The story list (PRD 11.1): status, headline, name shown, experience, format and date. */
export function QueueList({ items, selectedId, query }: { items: QueueItem[]; selectedId?: string; query: string }) {
  if (!items.length) {
    // COPY GAP G12: placeholder.
    return <p className="ds-p3 text-muted-foreground" data-placeholder>No stories match.</p>;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Stories">
      {items.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/stories/${s.id}${query}`}
            aria-current={s.id === selectedId ? "page" : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary",
              s.id === selectedId ? "border-brand-teal-500" : "border-border",
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              {s.safeguarding && s.status !== "safeguarding_review" && <Badge variant="destructive">Safeguarding</Badge>}
            </span>
            <span className="ds-p3 font-semibold text-foreground">{s.headline || "No headline"}</span>
            <span className="ds-p5 text-muted-foreground">
              {[s.name, s.expType, s.format ? FORMAT_LABEL[s.format] : null, s.submittedAt?.toLocaleDateString("en-GB")].filter(Boolean).join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
