import { Avatar, AvatarFallback } from "@springpod/design-system/components/ui/avatar";
import { Tag } from "@springpod/design-system/components/ui/tag";
import { cn } from "@springpod/design-system/lib/utils";
import { TRUST_LABEL_TEXT, type TrustLabel } from "@/flow/display";

export interface QuoteCardProps {
  quote: string;
  name: string;
  then: string;
  now?: string;
  trust: TrustLabel;
  className?: string;
}

/**
 * Quote size steps by length so text never clips; the card grows instead (PRD 5.4).
 * The type scale has no 26px step, so the short step uses the nearest token, 24px.
 */
export function quoteSize(quote: string): "short" | "medium" | "long" {
  const n = quote.trim().length;
  return n <= 70 ? "short" : n <= 120 ? "medium" : "long";
}

const QUOTE_TYPE = {
  short: "text-h5",
  medium: "text-content-h3",
  long: "text-content-h4",
} as const;

/** The branded quote card. Always navy, in both themes. One component for the flow, done screen, admin and PNG. */
export function QuoteCard({ quote, name, then, now, trust, className }: QuoteCardProps) {
  const text = quote.trim() || "Your quote will appear here.";
  const size = quoteSize(text);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <figure
      data-size={size}
      // One grid cell holds a 4:5 spacer and the content. The row takes the taller of the two,
      // so the card keeps its shape for short quotes and grows for long ones, never clipping.
      className={cn("relative isolate grid w-full shrink-0 grid-cols-1 rounded-3xl bg-brand-navy text-white", className)}
    >
      <div aria-hidden className="col-start-1 row-start-1 aspect-4/5" />
      {/* Soft teal glow */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-3xl bg-radial-[at_0%_100%] from-brand-teal/40 via-brand-teal/10 via-40% to-transparent to-70%"
      />
      <div className="col-start-1 row-start-1 flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-2">
          <span aria-hidden className="h-8 font-serif text-h2 text-brand-teal-400">
            &ldquo;
          </span>
          <Tag className="h-auto bg-white/10 px-3 py-1 text-brand-teal-100">{TRUST_LABEL_TEXT[trust]}</Tag>
        </div>
        <blockquote className={cn("flex flex-1 items-center font-serif font-normal text-pretty", QUOTE_TYPE[size])}>
          <p>{text}</p>
        </blockquote>
        <figcaption className="flex items-center gap-3 border-t border-white/15 pt-4">
          <Avatar size="sm" aria-hidden>
            <AvatarFallback className="bg-brand-teal font-bold">{initial}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="ds-p4 font-semibold">{name}</b>
            <span className="ds-p5 wrap-anywhere text-brand-grey-300">{then}</span>
            {now && <span className="ds-p5 wrap-anywhere font-medium text-brand-teal-400">Now {now}</span>}
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
