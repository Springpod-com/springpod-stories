"use client";

import { FieldError } from "@springpod/design-system/components/ui/field";
import { cn } from "@springpod/design-system/lib/utils";
import { forwardRef, type ReactNode } from "react";

/** Question title and optional sub-line. The title receives focus on each new screen. */
export const QuestionHeading = forwardRef<
  HTMLHeadingElement,
  { title: ReactNode; sub?: ReactNode; id?: string; subId?: string; className?: string }
>(function QuestionHeading({ title, sub, id, subId, className }, ref) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <h1 ref={ref} id={id} tabIndex={-1} className="ds-h4 text-foreground outline-none">
          {title}
        </h1>
        {sub && (
          <p id={subId} className="ds-p3 text-muted-foreground">
            {sub}
          </p>
        )}
      </div>
    );
});

/** Validation message shown on press, never by disabling the button (PRD 5.1). */
export function ValidationMessage({ message, id }: { message: string | null; id?: string }) {
  return (
    <FieldError id={id} className="ds-p3 font-medium">
      {message}
    </FieldError>
  );
}

/**
 * Holds the primary button (and any small secondary action). Pinned to the bottom
 * of the screen on phones, within thumb reach; sits under the answers on desktop.
 */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // springpod-audit-allow: safe-area inset keeps the button clear of the phone's home bar; it is not a spacing value
        "sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col items-center gap-3 bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "md:static md:mx-0 md:mt-2 md:bg-transparent md:p-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The column every question screen sits in. */
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col gap-6", className)}>{children}</div>;
}
