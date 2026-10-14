"use client";

import { FilterBar, FilterBarSelect } from "@springpod/design-system/components/ui/filter-bar";
import { Input } from "@springpod/design-system/components/ui/input";
import { SelectItem } from "@springpod/design-system/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CHANNELS } from "@/flow/options";
import { FORMAT_LABEL, STATUS } from "./labels";

const ALL = "all";

/** Facets from PRD 11.1. COPY GAP G12: the filter labels are placeholders. */
const FACETS: { key: string; label: string; all: string; options: [string, string][] }[] = [
  {
    key: "status",
    label: "Status",
    all: "All statuses",
    options: (Object.keys(STATUS) as (keyof typeof STATUS)[]).filter((s) => s !== "draft").map((s) => [s, STATUS[s].label]),
  },
  { key: "format", label: "Format", all: "All formats", options: Object.entries(FORMAT_LABEL) },
  { key: "trust", label: "Trust", all: "Any trust label", options: [["verified", "Verified"], ["community", "Community story"]] },
  { key: "age", label: "Age", all: "All ages", options: [["age_14_17", "14 to 17"], ["age_18_24", "18 to 24"], ["age_25_plus", "25 or over"]] },
  { key: "channel", label: "Channel", all: "All channels", options: CHANNELS.map((c) => [c.value, c.label]) },
  { key: "media", label: "Media", all: "With or without media", options: [["yes", "Has media"], ["no", "No media"]] },
  { key: "safeguarding", label: "Safeguarding", all: "All stories", options: [["yes", "Safeguarding only"]] },
];

/** The queue filters and search, kept in the address so a filtered queue can be shared. */
export function QueueFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  // Search after a short pause in typing.
  useEffect(() => {
    if ((params.get("q") ?? "") === q.trim()) return;
    const timer = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(timer);
  });

  return (
    <div className="flex flex-col gap-3">
      <Input type="search" aria-label="Search headlines and stories" placeholder="Search headlines and stories" value={q} onChange={(e) => setQ(e.target.value)} />
      <FilterBar label="Filter the queue">
        {FACETS.map((f) => (
          <FilterBarSelect key={f.key} placeholder={f.label} aria-label={f.label} value={params.get(f.key) ?? ALL} onValueChange={(v) => set(f.key, v)}>
            <SelectItem value={ALL}>{f.all}</SelectItem>
            {f.options.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterBarSelect>
        ))}
      </FilterBar>
    </div>
  );
}
