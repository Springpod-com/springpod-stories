import { Button } from "@springpod/design-system/components/ui/button";
import { Progress } from "@springpod/design-system/components/ui/progress";
import { IconShortArrowBack } from "@springpod/design-system/icons/platform/short-arrow-back";
import { cn } from "@springpod/design-system/lib/utils";
import type { ChapterProgress as Chapter } from "@/flow/engine";

interface Props {
  chapters: Chapter[];
  current?: string;
  onBack: () => void;
  canGoBack: boolean;
}

/** Back arrow, four chapter bars (About you, Experience, Your story, Sharing) and the chapter name. */
export function ChapterProgress({ chapters, current, onBack, canGoBack }: Props) {
  return (
    <nav aria-label="Progress" className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} disabled={!canGoBack} className="-ml-2">
          <IconShortArrowBack size={24} />
        </Button>
        <div className="grid flex-1 grid-cols-4 gap-1">
          {chapters.map((c) => (
            <Progress
              key={c.id}
              value={c.fill}
              aria-label={c.name}
              // Hide the empty indicator so no sub-pixel sliver shows at 0%.
              className={cn("h-1 bg-brand-grey-200 *:bg-brand-teal dark:bg-muted", c.fill === 0 && "*:invisible")}
            />
          ))}
        </div>
      </div>
      {current && <p className="ds-tag-text pl-10 uppercase text-brand-teal-800 dark:text-brand-teal-300">{current}</p>}
    </nav>
  );
}
