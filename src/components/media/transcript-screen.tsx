"use client";

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { FileUploadItem, FileUploadList } from "@springpod/design-system/components/ui/file-upload";
import { Spinner } from "@springpod/design-system/components/ui/spinner";
import { Textarea } from "@springpod/design-system/components/ui/textarea";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "@/components/flow/layout";
import { findQuestion, validationError } from "@/flow/engine";
import { QUESTIONS } from "@/flow/questions";
import { wordCount, type FlowState } from "@/flow/state";
import { verdict } from "@/lib/media/checks";
import { retryUpload, useMediaSelection } from "@/lib/media/media-store";
import type { MediaView } from "@/lib/media/schema";
import { fetchMedia } from "@/lib/media/upload";
import { CheckList } from "./check-list";

const POLL_MS = 2000;
const SAVE_DELAY_MS = 800;

interface Props {
  state: FlowState;
  onChange: (next: FlowState) => void;
  onNext: (next?: FlowState) => void;
  /** Back to the capture screen with nothing chosen. */
  onFilmAgain: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

const saveTranscript = (mediaId: string, transcript: string) =>
  fetch(`/api/media/${mediaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
    keepalive: true,
  }).catch(() => undefined);

/** Upload progress, the server checks, then the transcript to correct (PRD 6.3, 7.2). */
export function TranscriptScreen({ state, onChange, onNext, onFilmAgain, headingRef }: Props) {
  const isVideo = state.format === "video";
  const noun = isVideo ? "video" : "voice note";
  const again = isVideo ? "Film again" : "Record again";
  const selection = useMediaSelection();
  const upload = selection?.upload.mediaId === state.mediaId ? selection.upload : null;
  const online = useOnline();
  const [media, setMedia] = useState<MediaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const subId = useId();
  const countId = useId();
  const errorId = useId();

  const uploading = upload?.status === "uploading";
  const settled = media?.status === "ready" || media?.status === "failed";

  // Poll until the file is processed and transcribed.
  useEffect(() => {
    if (!state.mediaId || uploading || settled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const m = await fetchMedia(state.mediaId).catch(() => null);
      if (!live) return;
      if (m) setMedia(m);
      if (!m || (m.status !== "ready" && m.status !== "failed")) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [state.mediaId, uploading, settled]);

  // Fill the box once, when the transcript arrives.
  const filled = useRef(Boolean(state.transcript));
  useEffect(() => {
    if (filled.current || media?.status !== "ready" || media.transcript === null) return;
    filled.current = true;
    if (!state.transcript) onChange({ ...state, transcript: media.transcript });
  }, [media, state, onChange]);

  // Save corrections as people type.
  const lastSaved = useRef(state.transcript);
  useEffect(() => {
    if (!filled.current || state.transcript === lastSaved.current || media?.status !== "ready") return;
    const timer = setTimeout(() => {
      lastSaved.current = state.transcript;
      void saveTranscript(state.mediaId, state.transcript);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.transcript, state.mediaId, media?.status]);

  const heading = (
    <QuestionHeading
      ref={headingRef}
      id={headingId}
      subId={subId}
      title="Check your transcript"
      sub={`We turned your ${noun} into text. Fix anything we misheard, especially names and places.`}
    />
  );

  const filmAgain = (
    <StickyActions>
      <Button className="w-full" onClick={onFilmAgain}>
        {again}
      </Button>
    </StickyActions>
  );

  // Still sending the file.
  if (upload && (upload.status === "uploading" || upload.status === "error") && selection) {
    const failed = upload.status === "error";
    return (
      <ScreenBody>
        {heading}
        {/* COPY GAP G3 and G4: placeholders until the upload copy is written. */}
        <p className="ds-p3 text-foreground" data-placeholder aria-live="polite">
          {failed
            ? "Your file didn't finish sending."
            : online
              ? `Sending your ${noun}. Keep this page open.`
              : "You're offline. We'll carry on sending when you're back online."}
        </p>
        <FileUploadList aria-label={`Your ${noun}`}>
          <FileUploadItem
            fileName={selection.fileName}
            size={selection.file.size}
            progress={failed ? undefined : Math.round(upload.progress * 100)}
            error={failed ? "The upload didn't finish. Check your connection and try again." : undefined}
          />
        </FileUploadList>
        {failed && (
          <StickyActions>
            <Button className="w-full" onClick={() => retryUpload()}>
              Try again
            </Button>
          </StickyActions>
        )}
      </ScreenBody>
    );
  }

  // Reloaded part way through sending: the file isn't on the server and isn't in this tab any more.
  if (!media || (media.status === "uploading" && !upload)) {
    return (
      <ScreenBody>
        {heading}
        {media ? (
          // COPY GAP G4: placeholder.
          <>
            <Alert variant="destructive" data-placeholder>
              <AlertDescription>Your {noun} didn&apos;t finish sending. Choose it again.</AlertDescription>
            </Alert>
            {filmAgain}
          </>
        ) : (
          <Alert variant="info">
            <AlertDescription className="flex items-center gap-2">
              <Spinner className="size-4" aria-hidden />
              Checking your {noun}…
            </AlertDescription>
          </Alert>
        )}
      </ScreenBody>
    );
  }

  if (media.status === "failed") {
    return (
      <ScreenBody>
        {heading}
        {/* COPY GAP G3: placeholder. */}
        <Alert variant="destructive" data-placeholder>
          <AlertDescription>We couldn&apos;t open that file. {again}, or upload a different file.</AlertDescription>
        </Alert>
        {filmAgain}
      </ScreenBody>
    );
  }

  // The server has the last word on the checks (PRD 7.2).
  if (media.serverChecks && verdict(media.serverChecks) === "fail") {
    return (
      <ScreenBody>
        {heading}
        <Alert variant="destructive" data-verdict="fail">
          <AlertTitle>Let&apos;s try that again.</AlertTitle>
          <AlertDescription>Fix the items marked below and re-record.</AlertDescription>
        </Alert>
        <CheckList checks={media.serverChecks} />
        {filmAgain}
      </ScreenBody>
    );
  }

  if (media.status !== "ready") {
    return (
      <ScreenBody>
        {heading}
        <Alert variant="info" data-status={media.status}>
          <AlertDescription className="flex items-center gap-2" aria-live="polite">
            <Spinner className="size-4" aria-hidden />
            {/* COPY GAP G3: the transcribing message is a placeholder; "Checking your …" is from the prototype. */}
            {media.serverChecks ? <span data-placeholder>Turning your {noun} into text…</span> : <>Checking your {noun}…</>}
          </AlertDescription>
        </Alert>
      </ScreenBody>
    );
  }

  const noTranscript = media.transcript === "" && !state.transcript;
  return (
    <ScreenBody>
      {heading}
      {noTranscript && (
        // COPY GAP G3: placeholder.
        <Alert variant="info" data-placeholder>
          <AlertDescription>We couldn&apos;t turn your {noun} into text. Type what you said below.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Textarea
          value={state.transcript}
          onChange={(e) => {
            onChange({ ...state, transcript: e.target.value });
            setError(null);
          }}
          aria-labelledby={headingId}
          aria-describedby={[subId, countId, error ? errorId : ""].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          className="min-h-72 font-serif"
        />
        <span id={countId} className="ds-p5 font-mono text-muted-foreground" aria-live="polite">
          {wordCount(state.transcript)} words
        </span>
      </div>
      <StickyActions>
        <ValidationMessage id={errorId} message={error} />
        <Button
          className="w-full"
          onClick={() => {
            const message = validationError(findQuestion(QUESTIONS, "transcript"), state);
            if (message) return setError(message);
            lastSaved.current = state.transcript;
            void saveTranscript(state.mediaId, state.transcript);
            // A changed transcript needs a fresh draft.
            const next = { ...state, draft: null };
            onChange(next);
            onNext(next);
          }}
        >
          Write up my story
        </Button>
      </StickyActions>
    </ScreenBody>
  );
}
