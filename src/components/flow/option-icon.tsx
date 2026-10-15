import { IconChat } from "@springpod/design-system/icons/platform/chat";
import { IconMic } from "@springpod/design-system/icons/platform/mic";
import { IconVideo } from "@springpod/design-system/icons/platform/video";
// The package has no pen icon (build plan Q8): lucide-react, already a package dependency, fills the gap.
import { PenLine } from "lucide-react";
import type { IconKey } from "@/flow/questions";

export function OptionIcon({ icon, size = 24 }: { icon: IconKey; size?: number }) {
  switch (icon) {
    case "chat":
      return <IconChat size={size} aria-hidden />;
    case "mic":
      return <IconMic size={size} aria-hidden />;
    case "video":
      return <IconVideo size={size} aria-hidden />;
    case "pen":
      return <PenLine size={size} strokeWidth={1.8} aria-hidden />;
  }
}
