import { Progress } from "@springpod/design-system/components/ui/progress";
import { useId } from "react";
import { wordCount, type FlowState } from "@/flow/state";

const LABELS = ["Getting started", "Good", "Strong", "Brilliant"] as const;

/** The person's own words for the chosen way of telling the story. */
function answers(s: FlowState): string[] {
  if (s.format === "interview") return s.turns.filter((t) => t.role === "user" && !t.quickReply).map((t) => t.content);
  if (s.format === "write") return [s.written];
  return s.transcript ? [s.transcript] : [];
}

/** Story strength (PRD 6.1): rewards length and specific, detailed answers. Ported from the prototype. */
export function storyStrength(s: FlowState): { pct: number; label: (typeof LABELS)[number] } {
  const parts = answers(s);
  const words = wordCount(parts.join(" "));
  const detailed = parts.filter((a) => wordCount(a) >= 25).length;
  const pct = Math.min(100, Math.round(words / 2.2 + detailed * 8));
  const label = pct < 25 ? LABELS[0] : pct < 55 ? LABELS[1] : pct < 85 ? LABELS[2] : LABELS[3];
  return { pct, label };
}

export function StoryStrength({ state }: { state: FlowState }) {
  const id = useId();
  const { pct, label } = storyStrength(state);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span id={id} className="ds-p4">
          Story strength
        </span>
        <b className="ds-p4 font-semibold text-brand-blue-600 dark:text-brand-blue-300">{label}</b>
      </div>
      <Progress value={pct} aria-labelledby={id} aria-valuetext={label} className="h-2" />
    </div>
  );
}
