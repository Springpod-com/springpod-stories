"use client";

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { useState } from "react";
import { ValidationMessage } from "@/components/flow/layout";

/** The confirm step on the remove page. COPY GAP G8: all wording here is a placeholder. */
export function RemoveStory({ token, removed: initial }: { token: string; removed: boolean }) {
  const [removed, setRemoved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (removed) {
    return (
      <Alert variant="success" data-placeholder data-removed>
        <AlertTitle>Your story has been removed</AlertTitle>
        <AlertDescription>[Copy needed G8] It won&apos;t be used again. Any video or voice note is deleted within 30 days.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="ds-p3 self-start" data-placeholder>
        [Copy needed G8] Removing your story takes it off Springpod and stops us using it anywhere else.
      </p>
      <ValidationMessage message={error} />
      <Button
        className="w-full"
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/remove/${token}`, { method: "POST" });
            if (!res.ok) throw new Error(String(res.status));
            setRemoved(true);
          } catch {
            setError("We couldn't remove your story. Check your connection and try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Remove my story
      </Button>
    </div>
  );
}
