import { SpringpodLogo } from "@springpod/design-system/components/ui/springpod-logo";
import { Separator } from "@springpod/design-system/components/ui/separator";
import { cn } from "@springpod/design-system/lib/utils";
import type { ReactNode } from "react";

/**
 * Logo and product name. The logo ink follows the theme: navy on light, white in dark mode.
 * The admin uses the wide version with its links on the right.
 */
export function SiteHeader({
  product = "Work Experience Stories",
  wide = false,
  children,
}: {
  product?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    // springpod-audit-allow: safe-area inset keeps the header clear of the phone's notch; it is not a spacing value
    <header className="sticky top-0 z-20 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
      <div className={cn("mx-auto flex h-16 w-full items-center gap-3 px-4", wide ? "max-w-6xl" : "max-w-130")}>
        {/* 38 x 4 = 152px wide: logo rule minimum is 150px */}
        <SpringpodLogo size={38} role="img" aria-label="Springpod" />
        <Separator orientation="vertical" className="h-6" />
        <span className="ds-button-text-sm min-w-0 text-brand-teal-800 md:text-label-4 dark:text-brand-teal-300">{product}</span>
        {children && <div className="ml-auto flex shrink-0 items-center gap-3">{children}</div>}
      </div>
    </header>
  );
}
