import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Separator } from "@springpod/design-system/components/ui/separator";
import { Tag } from "@springpod/design-system/components/ui/tag";
import { CheckList } from "@/components/media/check-list";
import { QuoteCard } from "@/components/quote-card/quote-card";
import { CHANNELS } from "@/flow/options";
import { fmtTime } from "@/lib/media/checks";
import { TEAM_CHECKS, type StoryDetail as Detail } from "@/lib/server/admin";
import { Button } from "@springpod/design-system/components/ui/button";
import type { PackView } from "@/lib/server/content-pack";
import { ContentPack } from "./content-pack";
import { StatusBadge, TrustBadge } from "./labels";
import { PublishPanel } from "./publish-panel";
import { ResolveFlag } from "./resolve-flag";
import { ReviewPanel } from "./review-panel";

const FLAG_VARIANT = {
  safeguarding: "destructive",
  personal_data: "warning",
  named_person: "warning",
  negative_named_org: "warning",
  named_org: "info",
  other: "info",
} as const;

/** One story, as in `design/screens/42-admin-queue-video-checks.png` (PRD 11.2). */
export function StoryDetail({
  story,
  review,
  pack,
  canMakePack,
}: {
  story: Detail;
  review: { blockers: string[]; canDecide: { changes: boolean; reject: boolean }; safeguardingOpen: boolean };
  /** Shown for stories in review or approved (PRD 12). */
  pack: PackView | null;
  canMakePack: boolean;
}) {
  const f = story.facts;
  const facts: [string, string][] = [
    ["Name shown", f.nameShown],
    ["Age", f.age],
    ["Experience", f.experience],
    ["Organisation", f.organisation || "Not given"],
    ["Area", f.area],
    ["Now", f.now],
    ["Submitted as", f.submittedAs],
    ["Can appear on", CHANNELS.filter((c) => f.channels.includes(c.value)).map((c) => c.label).join(", ")],
    ["Parent consent", f.parentConsent],
  ];
  const openFlags = story.flags.filter((x) => !x.resolved);
  const media = story.media;
  const items = media ? TEAM_CHECKS[media.kind].map((c) => ({ ...c, ...story.checklist[c.id] })) : null;

  return (
    <article className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm" aria-labelledby="story-headline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TrustBadge trust={story.trust} />
        <StatusBadge status={story.status} />
      </div>
      <h2 id="story-headline" className="ds-h5">
        {story.headline || "No headline"}
      </h2>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="ds-tag-text uppercase text-muted-foreground">{label}</dt>
            <dd className="ds-p4 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3" aria-label="Flags">
        {openFlags.map((flag) => (
          <Alert key={flag.id} variant={FLAG_VARIANT[flag.type as keyof typeof FLAG_VARIANT] ?? "info"} data-flag={flag.type}>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{flag.detail}</span>
              {flag.type !== "safeguarding" && <ResolveFlag storyId={story.id} flagId={flag.id} />}
            </AlertDescription>
          </Alert>
        ))}
        {story.trust === "verified" && (
          <Alert variant="success">
            <AlertDescription>Matched to a completed Springpod programme.</AlertDescription>
          </Alert>
        )}
        {!openFlags.length && (
          <Alert variant="success">
            <AlertDescription>Automated check: no contact details or harmful content found.</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {story.story.split(/\n\s*\n/).map((p, i) => (
          <p key={i} className="ds-p3 font-serif text-foreground">
            {p}
          </p>
        ))}
        {story.skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {story.skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
        )}
        <QuoteCard {...story.card} className="max-w-80" />
      </div>

      {story.interview.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="ds-p3 cursor-pointer font-semibold">Interview</summary>
          <ol className="flex flex-col gap-2 pt-2">
            {story.interview.map((t, i) => (
              <li key={i} className="ds-p4">
                <span className="font-semibold">{t.role === "assistant" ? "Interviewer" : f.nameShown || "Them"}: </span>
                {t.content}
              </li>
            ))}
          </ol>
        </details>
      )}

      <Separator />

      {media && (
        <section className="flex flex-col gap-4" aria-labelledby="media-checks">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="media-checks" className="ds-h6">
              {media.kind === "video" ? "Video checks" : "Voice note checks"}
            </h3>
            <span className="ds-p5 font-mono text-muted-foreground">
              {[media.durationS ? fmtTime(media.durationS) : null, media.width ? `${media.width}×${media.height}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          {media.playbackUrl &&
            (media.kind === "video" ? (
              <video src={media.playbackUrl} poster={media.posterUrl ?? undefined} controls playsInline preload="metadata" className="max-h-96 w-full rounded-2xl bg-muted object-contain" />
            ) : (
              <audio src={media.playbackUrl} controls preload="metadata" className="w-full" />
            ))}
          {media.transcript && (
            <details>
              <summary className="ds-p3 cursor-pointer font-semibold">Transcript</summary>
              <p className="ds-p4 whitespace-pre-wrap pt-2 font-serif">{media.transcript}</p>
            </details>
          )}
          <span className="ds-tag-text uppercase text-muted-foreground">
            Automated{media.checksSource === "browser" ? " (browser only; the server checks haven't run)" : ""}
          </span>
          <CheckList checks={media.checks} className="rounded-xl border border-border p-4" />
          {media.downloads && (
            <div className="flex flex-wrap gap-3" aria-label="Downloads">
              {media.downloads.media && (
                <Button asChild variant="outline" size="sm">
                  <a href={media.downloads.media}>{media.kind === "video" ? "Download video (MP4)" : "Download voice note (M4A)"}</a>
                </Button>
              )}
              {media.downloads.captions && (
                <Button asChild variant="outline" size="sm">
                  <a href={media.downloads.captions}>Download captions (SRT)</a>
                </Button>
              )}
              {media.downloads.poster && (
                <Button asChild variant="outline" size="sm">
                  <a href={media.downloads.poster}>Download poster frame</a>
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <ReviewPanel
        storyId={story.id}
        firstName={f.nameShown}
        checks={items}
        checksTitle="Team review"
        blockers={review.blockers}
        canDecide={review.canDecide}
        safeguardingOpen={review.safeguardingOpen}
        parentPending={story.parentPending}
        trust={story.trust}
      />
      {story.status === "approved" && <PublishPanel storyId={story.id} published={story.published} />}
      {pack && (
        <>
          <Separator />
          <ContentPack storyId={story.id} view={pack} canMake={canMakePack} />
        </>
      )}
      {story.decision?.reason && (
        <p className="ds-p4 text-muted-foreground">
          {story.decision.decision === "rejected" ? "Rejected" : "Changes requested"}: {story.decision.reason}
        </p>
      )}
    </article>
  );
}
