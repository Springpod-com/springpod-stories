import { SpringpodLogo } from "@springpod/design-system/components/ui/springpod-logo";
import { Separator } from "@springpod/design-system/components/ui/separator";

/** Logo and product name. The logo ink follows the theme: navy on light, white in dark mode. */
export function SiteHeader({ product = "Work Experience Stories" }: { product?: string }) {
  return (
    // springpod-audit-allow: safe-area inset keeps the header clear of the phone's notch; it is not a spacing value
    <header className="sticky top-0 z-20 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full max-w-130 items-center gap-3 px-4">
        {/* 38 x 4 = 152px wide: logo rule minimum is 150px */}
        <SpringpodLogo size={38} role="img" aria-label="Springpod" />
        <Separator orientation="vertical" className="h-6" />
        <span className="ds-button-text-sm text-brand-teal-800 md:text-label-4 dark:text-brand-teal-300">{product}</span>
      </div>
    </header>
  );
}
