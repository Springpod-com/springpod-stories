"use client";

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { useState } from "react";
import { ValidationMessage } from "@/components/flow/layout";
import type { ParentDecision } from "@/lib/server/parent";

type Decided = "approved" | "approved_anonymous" | "declined";

// COPY GAP G7: the confirmation for each decision is a placeholder.
const CONFIRMATION: Record<Decided, string> = {
  approved: "You approved this story.",
  approved_anonymous: "You approved this story without their name.",
  declined: "You declined this story. It won't be used.",
};

/** The three choices (PRD 14: Approve, Approve without name, Decline), then a confirmation. */
export function ParentDecisionButtons({ token, decided: initial }: { token: string; decided: Decided | null }) {
  const [decided, setDecided] = useState<Decided | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: ParentDecision) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDecided(((await res.json()) as { decided: Decided }).decided);
    } catch {
      // COPY GAP G7: placeholder.
      setError("We couldn't save your answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (decided) {
    return (
      <Alert variant={decided === "declined" ? "default" : "success"} data-placeholder data-decided={decided} aria-live="polite">
        <AlertTitle>{CONFIRMATION[decided]}</AlertTitle>
        <AlertDescription>[Copy needed G7] What happens next goes here.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ValidationMessage message={error} />
      <Button className="w-full" onClick={() => void decide("approve")}>
        Approve
      </Button>
      <Button variant="secondary" className="w-full" onClick={() => void decide("approve_anonymous")}>
        Approve without name
      </Button>
      <Button variant="link" size="sm" onClick={() => void decide("decline")}>
        Decline
      </Button>
    </div>
  );
}
