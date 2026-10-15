import { Analytics } from "@/components/analytics";
import { StoryFlow } from "@/components/flow/story-flow";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <StoryFlow />
      <Analytics />
    </div>
  );
}
