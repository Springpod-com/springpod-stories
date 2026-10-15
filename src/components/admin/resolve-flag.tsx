"use client";

import { Button } from "@springpod/design-system/components/ui/button";
import { useTransition } from "react";
import { resolveFlagAction } from "@/app/admin/actions";

/** Marks a flag as dealt with (COPY GAP G12: label is a placeholder). */
export function ResolveFlag({ storyId, flagId }: { storyId: string; flagId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await resolveFlagAction(storyId, flagId)))}>
      Mark as dealt with
    </Button>
  );
}
