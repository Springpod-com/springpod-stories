"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { useState, useTransition } from "react";
import { generateContentPackAction } from "@/app/admin/actions";
import { ValidationMessage } from "@/components/flow/layout";
import type { PackAsset, PackView } from "@/lib/server/content-pack";

/** COPY GAP G12: asset titles are placeholders, apart from the prototype's "What you'll get" text. */
const TITLE: Record<string, string> = {
  linkedin: "LinkedIn post",
  instagram: "Instagram caption",
  video_hook: "TikTok or Reels hook and shots",
  blog: "Blog title and intro",
  snippet: "Website snippet",
  tags: "Tags",
  quote_card_4x5: "Quote card, 1080 × 1350",
  quote_card_9x16: "Quote card, 1080 × 1920",
};
const ORDER = ["linkedin", "instagram", "video_hook", "blog", "snippet", "tags"] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function AssetCard({ asset }: { asset: PackAsset }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4" data-asset={asset.kind}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="ds-p3 font-semibold">{TITLE[asset.kind]}</h4>
        {asset.content && <CopyButton text={asset.content} />}
        {asset.url && (
          <Button asChild variant="ghost" size="sm">
            <a href={asset.url}>Download</a>
          </Button>
        )}
      </div>
      {asset.content && <p className="ds-p4 whitespace-pre-wrap text-foreground">{asset.content}</p>}
      {asset.url && (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived link to a private image
        <img src={asset.url} alt={TITLE[asset.kind]} className="max-h-96 w-auto self-start rounded-lg border border-border" />
      )}
      <span className="ds-p5 text-muted-foreground">
        {asset.createdBy}, {new Date(asset.createdAt).toLocaleString("en-GB")}
      </span>
    </div>
  );
}

/** The content pack (PRD 12): only what the person agreed to, with copy buttons and history. */
export function ContentPack({ storyId, view, canMake }: { storyId: string; view: PackView; canMake: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const texts = ORDER.map((k) => view.latest[k]).filter(Boolean) as PackAsset[];
  const cards = [view.latest.quote_card_4x5, view.latest.quote_card_9x16].filter(Boolean) as PackAsset[];
  const made = texts.length > 0;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="content-pack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="content-pack" className="ds-h6">
          Content pack
        </h3>
        {canMake && (
          <Button
            variant="teal"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await generateContentPackAction(storyId);
                if (!result.ok) setError(result.problem);
                else setFallback(Boolean(result.fallback));
              })
            }
          >
            {made ? "Regenerate" : "Generate content pack"}
          </Button>
        )}
      </div>
      {!canMake && <p className="ds-p4 text-muted-foreground">Only the content team can make content packs.</p>}
      <ValidationMessage message={error} />
      {fallback && (
        // COPY GAP G12: placeholder.
        <Alert variant="info" data-placeholder>
          <AlertDescription>The AI wasn&apos;t available, so these use the story&apos;s own words. Regenerate later for a fuller pack.</AlertDescription>
        </Alert>
      )}
      {!made && (
        <div className="rounded-xl border border-border p-4">
          <span className="ds-tag-text uppercase text-muted-foreground">What you&apos;ll get</span>
          <p className="ds-p4 pt-2">
            A LinkedIn post, an Instagram caption, a TikTok or Reels hook with a shot list, a blog title and intro, and SEO tags. Only for the channels this
            person agreed to.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[...texts, ...cards].map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}
      </div>
      {made && !cards.length && <p className="ds-p4 text-muted-foreground" data-placeholder>Drawing the quote card images…</p>}
      {view.history.length > 0 && (
        <details>
          <summary className="ds-p4 cursor-pointer">Earlier versions ({view.history.length})</summary>
          <div className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2">
            {view.history.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
