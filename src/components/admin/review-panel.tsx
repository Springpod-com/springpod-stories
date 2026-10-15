"use client";

import { Alert, AlertDescription } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { Checkbox } from "@springpod/design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@springpod/design-system/components/ui/dialog";
import { Label } from "@springpod/design-system/components/ui/label";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { useId, useState, useTransition } from "react";
import {
  approveAction,
  clearSafeguardingAction,
  rejectAction,
  requestChangesAction,
  resendParentAction,
  setCheckAction,
  setTrustAction,
} from "@/app/admin/actions";
import { ValidationMessage } from "@/components/flow/layout";
import type { TrustLabel } from "@/generated/prisma/enums";

interface Props {
  storyId: string;
  firstName: string;
  /** Media checklist, or null for a story with no media. */
  checks: { id: string; label: string; by?: string; at?: string }[] | null;
  checksTitle: string;
  blockers: string[];
  canDecide: { changes: boolean; reject: boolean };
  safeguardingOpen: boolean;
  parentPending: boolean;
  trust: TrustLabel;
}

type DialogKind = "changes" | "reject" | "safeguarding" | null;

/**
 * The team checklist and actions (PRD 11.2). Approve stays disabled, with the reason shown, while
 * consent is pending, a safeguarding review is open or a check is unticked. The server checks again.
 * COPY GAP G10: dialog titles, labels and confirmations are placeholders.
 */
export function ReviewPanel({ storyId, firstName, checks, checksTitle, blockers, canDecide, safeguardingOpen, parentPending, trust }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [text, setText] = useState("");
  const blockersId = useId();
  const textId = useId();

  const run = (action: () => Promise<{ ok: boolean; problem?: string }>, done?: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const result = await action();
      if (!result.ok) setError(result.problem ?? "That didn't work. Try again.");
      else {
        setDialog(null);
        setText("");
        if (done) setNotice(done);
      }
    });

  const ticked = checks?.filter((c) => c.by).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {checks && (
        <fieldset className="flex flex-col gap-3">
          <legend className="ds-tag-text uppercase text-muted-foreground">
            {checksTitle} · {ticked} of {checks.length}
          </legend>
          {checks.map((c) => (
            <div key={c.id} className="flex items-start gap-3">
              <Checkbox
                id={`${storyId}-${c.id}`}
                checked={Boolean(c.by)}
                disabled={pending}
                onCheckedChange={(v) => run(() => setCheckAction(storyId, c.id, v === true))}
              />
              <Label htmlFor={`${storyId}-${c.id}`} className="flex flex-col items-start gap-0.5">
                <span className="ds-p3">{c.label}</span>
                {c.by && <span className="ds-p5 text-muted-foreground">{`${c.by}, ${new Date(c.at!).toLocaleString("en-GB")}`}</span>}
              </Label>
            </div>
          ))}
        </fieldset>
      )}

      {blockers.length > 0 && (
        <ul id={blockersId} className="ds-p4 flex flex-col gap-1 text-muted-foreground" data-testid="approve-blockers">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <ValidationMessage message={error} />
      {notice && (
        <Alert variant="success" aria-live="polite">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button disabled={pending || blockers.length > 0} aria-describedby={blockers.length ? blockersId : undefined} onClick={() => run(() => approveAction(storyId))}>
          Approve
        </Button>
        <Button variant="outline" disabled={pending || !canDecide.changes} onClick={() => setDialog("changes")}>
          Request changes
        </Button>
        <Button variant="outline" className="border-destructive text-destructive" disabled={pending || !canDecide.reject} onClick={() => setDialog("reject")}>
          Reject
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        {safeguardingOpen && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setDialog("safeguarding")}>
            Clear safeguarding review
          </Button>
        )}
        {parentPending && !safeguardingOpen && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => resendParentAction(storyId), "Parent email sent again.")}>
            Resend parent email
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setTrustAction(storyId, trust === "verified" ? "community" : "verified"))}
        >
          {trust === "verified" ? "Mark as community story" : "Mark as verified by Springpod"}
        </Button>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === "safeguarding" ? (
            <>
              <DialogHeader>
                <DialogTitle>Clear the safeguarding review?</DialogTitle>
                <DialogDescription>
                  Only once the safeguarding lead has dealt with the concern. The story goes back to the queue, and a parent or carer who hasn&apos;t been asked yet is emailed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button disabled={pending} onClick={() => run(() => clearSafeguardingAction(storyId))}>
                  Clear review
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{dialog === "changes" ? "Request changes" : "Reject this story"}</DialogTitle>
                <DialogDescription>
                  {dialog === "changes"
                    ? `${firstName || "They"} will get this message by email, with a link to edit the story.`
                    : "Give a reason for the record. It isn't emailed."}
                </DialogDescription>
              </DialogHeader>
              <Label htmlFor={textId}>{dialog === "changes" ? "Message" : "Reason"}</Label>
              <Textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" />
              <ValidationMessage message={error} />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={pending || !text.trim()}
                  onClick={() => run(() => (dialog === "changes" ? requestChangesAction(storyId, text) : rejectAction(storyId, text)))}
                >
                  {dialog === "changes" ? "Send request" : "Reject story"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
