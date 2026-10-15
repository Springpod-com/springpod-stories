"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@springpod/design-system/components/ui/avatar";
import { PlayButton } from "@springpod/design-system/components/ui/play-button";
import { Progress } from "@springpod/design-system/components/ui/progress";
import { Tag } from "@springpod/design-system/components/ui/tag";
import { VideoTimer } from "@springpod/design-system/components/ui/video-timer";
import { cn } from "@springpod/design-system/lib/utils";
import Image, { getImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OptionIcon } from "@/components/flow/option-icon";
import { EXAMPLES, REEL_INTERVAL_MS, type ExampleKind, type ExampleStory } from "./examples";

const KIND_LABEL: Record<ExampleKind, string> = { video: "Video", voice: "Voice note", written: "Written" };
const KIND_ICON = { video: "video", voice: "mic", written: "pen" } as const;

/** Card position relative to the current one: 0 front, 1 peeking behind, -1 leaving, 2 hidden. */
const POSITION = {
  0: "z-40 -translate-x-1/2 rotate-0 scale-100 opacity-100",
  1: "z-30 -translate-x-1/3 rotate-6 scale-92 opacity-75",
  2: "z-10 -translate-x-1/2 rotate-0 scale-85 opacity-0",
  [-1]: "z-20 -translate-x-4/3 -rotate-10 scale-90 opacity-0",
} as const;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the person asked for reduced motion. Treated as reduced on the server, so nothing animates before hydration. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

function KindTag({ kind, className }: { kind: ExampleKind; className?: string }) {
  return (
    <Tag className={cn("h-6 gap-1 px-2", className)}>
      <OptionIcon icon={KIND_ICON[kind]} size={16} />
      {KIND_LABEL[kind]}
    </Tag>
  );
}

function Person({ example }: { example: ExampleStory }) {
  // Through the image optimiser, so the avatar is AVIF or WebP at its shown size (PRD 17).
  const { props: image } = getImageProps({ src: example.portrait, alt: "", width: 40, height: 40 });
  return (
    <div className="flex items-center gap-3">
      <Avatar size="sm" className="size-10">
        <AvatarImage src={image.src} srcSet={image.srcSet} alt="" />
        <AvatarFallback>{example.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <b className="ds-p4 font-semibold">{example.name}</b>
        <small className="ds-p5 text-brand-grey-800">{example.meta}</small>
      </span>
    </div>
  );
}

function ExampleCard({ example, active, first }: { example: ExampleStory; active: boolean; first: boolean }) {
  if (example.kind === "video") {
    return (
      <div className="relative flex h-full flex-col justify-end p-4 text-white">
        {/* The first card's portrait is the largest thing on the start screen: load it straight away. */}
        <Image src={example.portrait} alt="" fill sizes="320px" preload={first} fetchPriority={first ? "high" : undefined} className="-z-10 object-cover object-[center_25%]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-brand-navy-800/15 from-30% to-brand-navy-800/85" />
        <KindTag kind="video" className="absolute top-4 left-4" />
        {example.duration && <VideoTimer className="absolute top-4 right-4 font-mono normal-case">{example.duration}</VideoTimer>}
        {/* Positioned wrapper: the package's elevate styles make the button itself position: relative.
            Inert, so the decorative play button isn't a control inside the reel's own button. */}
        <span aria-hidden inert className="pointer-events-none absolute top-2/5 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <PlayButton variant="white" size="md" tabIndex={-1} />
        </span>
        <p className="ds-p4 mb-2 self-start rounded-lg bg-brand-navy-800/55 px-2 py-1 font-medium">{example.quote}</p>
        <Progress value={active ? 40 : 0} aria-hidden className="mb-2 h-1 bg-white/30 *:bg-brand-teal-400" />
        <p className="ds-p5">
          <b className="font-semibold">{example.name}</b> · {example.meta}
        </p>
      </div>
    );
  }

  if (example.kind === "voice") {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <KindTag kind="voice" className="self-start" />
        <Person example={example} />
        <div aria-hidden className="flex items-center gap-2 rounded-full bg-brand-grey-200 py-1 pr-3 pl-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-navy text-white">
            <OptionIcon icon="mic" size={16} />
          </span>
          <span className="flex h-6 flex-1 items-center gap-0.5">
            {Array.from({ length: 28 }, (_, k) => (
              <i
                key={k}
                className="w-0.5 flex-1 rounded-full bg-brand-navy-400"
                style={{ height: `${20 + Math.round(Math.abs(Math.sin(k * 1.7 + example.name.length)) * 80)}%` }}
              />
            ))}
          </span>
          <span className="ds-p5 font-mono text-brand-grey-800">{example.duration}</span>
        </div>
        <p className="ds-p4 font-serif">&ldquo;{example.quote}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <KindTag kind="written" className="self-start" />
      <span aria-hidden className="h-4 font-serif text-h3 text-brand-teal">
        &ldquo;
      </span>
      <p className="font-serif text-content-h4 font-medium">{example.quote}</p>
      <div className="mt-auto">
        <Person example={example} />
      </div>
    </div>
  );
}

/**
 * Looping stack of example story cards (PRD 5.2). A new card every 3.6 seconds,
 * the next one peeks behind, tap to skip. Pauses while hovered or focused.
 * With reduced motion it shows the first card and does not loop.
 */
export function ExampleReel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = EXAMPLES.length;

  const current = EXAMPLES[index]!;

  const step = useCallback(() => setIndex((i) => (i + 1) % n), [n]);

  useEffect(() => {
    if (reducedMotion || paused) return;
    timer.current = setInterval(step, REEL_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reducedMotion, paused, step, index]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Example stories"
      className="relative pt-1"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Tag className="absolute top-0 left-0 z-50 h-auto bg-white/10 px-3 py-1 text-brand-teal-100">Example stories</Tag>
      {/* Cards are block content, so the tap target is a div with button semantics rather than a <button>. */}
      <div
        role="button"
        tabIndex={0}
        onClick={step}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            step();
          }
        }}
        aria-label={`Example story ${index + 1} of ${n}: ${current.name}, ${current.meta}. "${current.quote}" Show the next one`}
        className="relative mt-6 block h-62 w-full cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {EXAMPLES.map((example, i) => {
          const d = (i - index + n) % n;
          const pos = d === 0 ? 0 : d === 1 ? 1 : d === n - 1 ? -1 : 2;
          return (
            <article
              key={example.name}
              aria-hidden={pos !== 0}
              className={cn(
                "absolute top-0 left-1/2 isolate h-full w-4/5 overflow-hidden rounded-3xl bg-white text-left text-brand-navy",
                "transition-all duration-500 ease-in-out motion-reduce:transition-none",
                POSITION[pos],
              )}
            >
              <ExampleCard example={example} active={pos === 0} first={i === 0} />
            </article>
          );
        })}
      </div>
      <div aria-hidden className="mt-3 flex justify-center gap-1.5">
        {EXAMPLES.map((example, i) => (
          <i
            key={example.name}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-4.5 bg-brand-teal-400" : "w-1.5 bg-white/30",
            )}
          />
        ))}
      </div>
    </section>
  );
}
