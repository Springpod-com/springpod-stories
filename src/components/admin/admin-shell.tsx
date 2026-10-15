import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/admin/actions";
import { SiteHeader } from "@/components/site-header";
import type { Staff } from "@/lib/staff";
import { queueCounts } from "@/lib/server/admin";

/** Header, counts and the safeguarding lead warning around every admin page (PRD 11). */
export async function AdminShell({ staff, children }: { staff: Staff; children: ReactNode }) {
  const counts = await queueCounts();
  const leadMissing = !process.env.SAFEGUARDING_LEAD_EMAIL?.trim();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader product="Work Experience Stories admin" wide>
        <Button asChild variant="link" size="sm" className="hidden md:inline-flex">
          <Link href="/">View the public form</Link>
        </Button>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm" aria-label={`Sign out ${staff.name ?? ""}`.trim()}>
            Sign out
          </Button>
        </form>
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 pb-12">
        {leadMissing && (
          // COPY GAP G13: placeholder.
          <Alert variant="warning" data-placeholder>
            <AlertTitle>No safeguarding lead is set</AlertTitle>
            <AlertDescription>Safeguarding concerns are held for review, but nobody is emailed. Set SAFEGUARDING_LEAD_EMAIL.</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="ds-tag-text uppercase text-muted-foreground">Springpod Stories admin</span>
            <h1 className="ds-h4">Story queue</h1>
          </div>
          <dl className="flex gap-6 text-center">
            {[
              ["To review", counts.toReview],
              ["Approved", counts.approved],
              ["Total", counts.total],
            ].map(([label, n]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="ds-p5 text-muted-foreground">{label}</dt>
                <dd className="ds-h5 font-mono">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
        {children}
      </main>
    </div>
  );
}
