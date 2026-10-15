"use client";

import { Button } from "@springpod/design-system/components/ui/button";
import { IconEye } from "@springpod/design-system/icons/platform/eye";
import { IconLightMode } from "@springpod/design-system/icons/platform/light-mode";
import { IconMute } from "@springpod/design-system/icons/platform/mute";
import { IconPhone } from "@springpod/design-system/icons/platform/phone";
import { IconSecurity } from "@springpod/design-system/icons/platform/security";
import { IconTime } from "@springpod/design-system/icons/platform/time";
// No hand icon in the package (build plan Q8).
import { Hand } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions } from "@/components/flow/layout";

type TipIcon = "phone" | "sun" | "eye" | "quiet" | "timer" | "shield" | "hand";

const ICONS: Record<TipIcon, ReactNode> = {
  phone: <IconPhone size={20} aria-hidden />,
  sun: <IconLightMode size={20} aria-hidden />,
  eye: <IconEye size={20} aria-hidden />,
  quiet: <IconMute size={20} aria-hidden />,
  timer: <IconTime size={20} aria-hidden />,
  shield: <IconSecurity size={20} aria-hidden />,
  hand: <Hand size={20} strokeWidth={1.8} aria-hidden />,
};

/** Guidance copy from the prototype (PRD 6.3). */
export const GUIDE = {
  video: {
    title: "How to film a great video",
    sub: "Two minutes of prep makes a big difference. Your video could be shown to thousands of students.",
    tips: [
      ["phone", "Hold your phone upright", "Portrait works best on social media and on Springpod."],
      ["sun", "Face a window", "Light on your face, not behind you. Avoid sitting with a window at your back."],
      ["eye", "Camera at eye level", "Prop your phone on books or hold it at arm's length. Look at the lens, not the screen."],
      ["quiet", "Find somewhere quiet", "Turn off music and the TV. A tidy, plain background keeps the focus on you."],
      ["timer", "Aim for 30 to 90 seconds", "Short and specific beats long and general. One good moment is enough."],
      [
        "shield",
        "Keep it safe to share",
        "No other people's faces, no school uniform or logos, nothing confidential from the workplace like screens, documents or ID badges.",
      ],
    ],
    opener: "Start with: “Hi, I'm [first name] and I did my [experience] in [area].”",
    button: "I'm ready to film",
  },
  voice: {
    title: "How to record a great voice note",
    sub: "Your voice note is turned into a written story, and the best bits may become audio clips.",
    tips: [
      ["quiet", "Find a quiet room", "Close the window and turn off fans, music and the TV. Soft furnishings help reduce echo."],
      ["hand", "Phone a hand's width away", "About 15 cm from your mouth, pointing the bottom of the phone towards you."],
      ["timer", "Aim for 1 to 3 minutes", "Talk like you're telling a friend. Pauses are fine, we edit them out."],
      ["eye", "Speak a little slower than normal", "It makes the transcript more accurate and easier to listen to."],
      [
        "shield",
        "Keep it safe to share",
        "Use first names only. Don't mention your school, address or anything confidential from the workplace.",
      ],
    ],
    opener: "Start with: “I'm [first name] and I did my [experience] in [area].”",
    button: "I'm ready to record",
  },
} satisfies Record<string, { title: string; sub: string; tips: [TipIcon, string, string][]; opener: string; button: string }>;

export const PROMPTS = [
  "What did you actually do?",
  "One moment that stood out",
  "What was harder than you expected?",
  "Your advice for someone starting out",
];

export function GuideScreen({
  format,
  onNext,
  headingRef,
}: {
  format: "voice" | "video";
  onNext: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const guide = GUIDE[format];
  return (
    <ScreenBody>
      <QuestionHeading ref={headingRef} title={guide.title} sub={guide.sub} />
      <ul className="flex flex-col gap-4">
        {guide.tips.map(([icon, title, detail]) => (
          <li key={title} className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-teal-100 text-brand-teal-800 dark:bg-brand-teal-900 dark:text-brand-teal-100">
              {ICONS[icon]}
            </span>
            <span className="flex flex-col gap-1">
              <b className="ds-p3 font-semibold">{title}</b>
              <small className="ds-p4 text-muted-foreground">{detail}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-3xl bg-brand-navy p-5 text-white">
        <span className="ds-tag-text uppercase text-brand-teal-400">What to talk about</span>
        <ol className="ds-p3 flex list-decimal flex-col gap-1 pl-5">
          {PROMPTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <p className="ds-p4 font-serif">{guide.opener}</p>
        <span className="ds-p5 opacity-75">Tip: screenshot this card to use as prompts while you record.</span>
      </div>
      <StickyActions>
        <Button className="w-full" onClick={onNext}>
          {guide.button}
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
