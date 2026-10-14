"use client";

import { Spinner } from "@springpod/design-system/components/ui/spinner";
import { IconCheckCircle } from "@springpod/design-system/icons/platform/check-circle";
import { IconError } from "@springpod/design-system/icons/platform/error";
import { IconWarning } from "@springpod/design-system/icons/platform/warning";
import { cn } from "@springpod/design-system/lib/utils";
import type { Check, CheckState } from "@/lib/media/checks";

const ICON: Record<CheckState, React.ReactNode> = {
  pass: <IconCheckCircle size={20} className="text-success" aria-hidden />,
  warn: <IconWarning size={20} className="text-warning" aria-hidden />,
  fail: <IconError size={20} className="text-destructive" aria-hidden />,
  pending: <Spinner className="size-5 text-muted-foreground" aria-hidden />,
};

/** Screen reader wording for each state, since the icons are decorative. */
const STATE_TEXT: Record<CheckState, string> = { pass: "Passed", warn: "Tip", fail: "Needs fixing", pending: "Checking" };

/** The media checks (PRD 7.1), one row each with a plain fix. Copy from the prototype. */
export function CheckList({ checks, className }: { checks: Check[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)} aria-live="polite">
      {checks.map((c) => (
        <li key={c.id} data-check={c.id} data-state={c.state} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">{ICON[c.state]}</span>
          <span className="flex flex-col gap-0.5">
            <span className="ds-p3 font-semibold text-foreground">
              {c.label}
              <span className="sr-only">: {STATE_TEXT[c.state]}</span>
            </span>
            <span className="ds-p4 text-muted-foreground">{c.detail || (c.state === "pending" ? "Checking…" : "")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
