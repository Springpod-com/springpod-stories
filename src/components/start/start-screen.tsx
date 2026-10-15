import { Button } from "@springpod/design-system/components/ui/button";
import { IconMic } from "@springpod/design-system/icons/platform/mic";
import { IconPadlock } from "@springpod/design-system/icons/platform/padlock";
import { IconTime } from "@springpod/design-system/icons/platform/time";
import type { ReactNode, RefObject } from "react";
import { ExampleReel } from "./example-reel";

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-brand-teal-400">{icon}</span>
      <span className="ds-p3">{children}</span>
    </li>
  );
}

/** Start screen (PRD 5.2, screens 01 and 40): one navy box, navy in both themes. */
export function StartScreen({ onStart, headingRef }: { onStart: () => void; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className="relative isolate flex flex-col gap-6 overflow-hidden rounded-3xl bg-brand-navy p-6 text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-radial-[at_100%_0%] from-brand-teal-800/60 to-transparent to-60%"
      />
      <ExampleReel />
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="ds-h1 text-balance outline-none md:text-h4">
          Share your work experience story
        </h1>
        <p className="ds-p3 text-brand-grey-300">Your first taste of work could help someone else take theirs.</p>
        <ul className="flex flex-col gap-3">
          <Fact icon={<IconTime size={16} aria-hidden />}>About 5 minutes</Fact>
          <Fact icon={<IconMic size={16} aria-hidden />}>Write it, record a voice note or film a video</Fact>
          <Fact icon={<IconPadlock size={16} aria-hidden />}>You choose where it&apos;s shared</Fact>
        </ul>
        <Button variant="teal" className="mt-1 w-full" onClick={onStart}>
          Start my story
        </Button>
      </div>
    </section>
  );
}
