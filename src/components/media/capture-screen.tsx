"use client";

import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { FileUpload } from "@springpod/design-system/components/ui/file-upload";
import { Spinner } from "@springpod/design-system/components/ui/spinner";
import { IconMic } from "@springpod/design-system/icons/platform/mic";
import { IconVideo } from "@springpod/design-system/icons/platform/video";
import { cn } from "@springpod/design-system/lib/utils";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { QuestionHeading, ScreenBody, StickyActions, ValidationMessage } from "@/components/flow/layout";
import type { FlowState } from "@/flow/state";
import type { Check, MediaKind } from "@/lib/media/checks";
import { verdict as verdictOf } from "@/lib/media/checks";
import { track } from "@/lib/track";
import { chooseFile, chosenMediaId, clearSelection, retryUpload, useMediaSelection } from "@/lib/media/media-store";
import type { MediaView } from "@/lib/media/schema";
import { fetchMedia } from "@/lib/media/upload";
import { CheckList } from "./check-list";

interface Props {
  state: FlowState;
  onChange: (next: FlowState) => void;
  onNext: (next?: FlowState) => void;
  onChangeFormat: () => void;
  onTips: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** Copy from the prototype. */
const COPY = {
  video: {
    title: "Film your video",
    sub: "Use your phone's camera, or upload a video you've already made.",
    capture: "Film now",
    captureHint: "Opens your camera",
    again: "Film again",
    tips: "Portrait · facing a window · 30 to 90 seconds",
    accept: "video/*",
    uploadAccept: "video/*",
    noun: "video",
  },
  voice: {
    title: "Record your voice note",
    sub: "Use your phone's voice recorder, or upload a recording you've already made.",
    capture: "Record now",
    captureHint: "Opens your recorder",
    again: "Record again",
    tips: "Quiet room · phone 15 cm away · 1 to 3 minutes",
    accept: "audio/*",
    uploadAccept: "audio/*,.m4a,.mp3,.wav,.aac",
    noun: "voice note",
  },
} as const;

const BANNER = {
  pass: { variant: "success", title: "Looks great.", body: (noun: string) => `Your ${noun} passed every check.` },
  warn: { variant: "warning", title: "Good to go.", body: () => "A few tips below if you want to try again." },
  fail: { variant: "destructive", title: "Let's try that again.", body: () => "Fix the items marked below and re-record." },
} as const;

// COPY GAP G4: placeholders until the upload failure copy is written.
const UPLOAD_ERRORS = {
  no_draft: "We couldn't find your story on this device. Go back a step and try again.",
  failed: "We couldn't start sending your file. Check your connection and try again.",
} as const;

/** Film or record, or upload a file, then see the instant checks (PRD 6.3, 7.1). */
export function CaptureScreen({ state, onChange, onNext, onChangeFormat, onTips, headingRef }: Props) {
  const kind: MediaKind = state.format === "voice" ? "voice" : "video";
  const copy = COPY[kind];
  const selection = useMediaSelection();
  const captureInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const dropzone = useRef<HTMLDivElement>(null);
  // The dropzone is the control; its hidden file input shouldn't be a second one inside it
  // (design system issue logged in the build plan). The dropzone still opens it on click.
  useEffect(() => {
    dropzone.current?.querySelector("input[type=file]")?.setAttribute("inert", "");
  });
  const hintId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MediaView | null>(null);
  const [busy, setBusy] = useState(false);

  // A file chosen earlier (coming back, or a saved draft): show what the server has.
  const current = selection?.kind === kind ? selection : null;
  useEffect(() => {
    if (current || !state.mediaId) return;
    let live = true;
    void fetchMedia(state.mediaId).then((m) => live && setSaved(m));
    return () => {
      live = false;
    };
  }, [current, state.mediaId]);

  // Tracked once per chosen file, when its checks finish (PRD 16).
  const trackedSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!current || current.checking || !current.verdict || trackedSeq.current === current.seq) return;
    trackedSeq.current = current.seq;
    const failed = current.checks.filter((c) => c.state === "fail").map((c) => c.id);
    track("media_checks_result", { format: kind, verdict: current.verdict, failed: failed.join(",") });
  }, [current, kind]);

  const retry = (reason: "fail" | "warn" | "pass" | "different_file") => track("media_retry", { format: kind, reason });

  const pick = (files: FileList | File[] | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setSaved(null);
    // A new file replaces the chosen one; the transcript and draft go with it.
    if (state.mediaId) onChange({ ...state, mediaId: "", transcript: "", draft: null });
    void chooseFile(file, kind);
  };

  const inputs = (
    <>
      <input
        ref={captureInput}
        type="file"
        accept={copy.accept}
        capture={kind === "video" ? "user" : true}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="capture-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadInput}
        type="file"
        accept={copy.uploadAccept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="upload-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  const use = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // The upload never started (say the connection dropped): start it again.
      if (current?.upload.status === "error" && !current.upload.mediaId) retryUpload();
      const mediaId = current ? await chosenMediaId() : state.mediaId;
      const next = { ...state, mediaId, transcript: mediaId === state.mediaId ? state.transcript : "", draft: null };
      onChange(next);
      onNext(next);
    } catch {
      setError(UPLOAD_ERRORS[current?.upload.error === "no_draft" ? "no_draft" : "failed"]);
    } finally {
      setBusy(false);
    }
  };

  // Nothing chosen yet: the two ways in.
  if (!current && !(state.mediaId && saved)) {
    return (
      <ScreenBody>
        <QuestionHeading ref={headingRef} title={copy.title} sub={copy.sub} />
        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" aria-describedby={hintId} onClick={() => captureInput.current?.click()}>
            {kind === "video" ? <IconVideo size={20} aria-hidden /> : <IconMic size={20} aria-hidden />}
            {copy.capture}
          </Button>
          <span id={hintId} className="sr-only">
            {copy.captureHint}
          </span>
          <FileUpload
            ref={dropzone}
            accept={copy.uploadAccept}
            label="Upload a file"
            hint="From your phone or computer"
            onFilesSelected={(files) => pick(files)}
          />
          {inputs}
        </div>
        <p className="ds-p4 flex flex-wrap items-center gap-x-2 text-muted-foreground">
          <span>{copy.tips}</span>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onTips}>
            See all tips
          </Button>
        </p>
        <StickyActions>
          <Button variant="link" size="sm" onClick={onChangeFormat}>
            Change how I tell it
          </Button>
        </StickyActions>
      </ScreenBody>
    );
  }

  // The saved file, or the one just chosen.
  const checking = current ? current.checking : false;
  const checks: Check[] = current ? current.checks : (saved?.serverChecks ?? saved?.browserChecks ?? []);
  const result = current ? current.verdict : checks.length ? verdictOf(checks) : "pass";
  const previewUrl = current ? (current.previewable ? current.previewUrl : null) : (saved?.playbackUrl ?? null);
  const landscape = current?.landscape ?? false;
  const uploadError = current?.upload.status === "error" ? UPLOAD_ERRORS[current.upload.error === "no_draft" ? "no_draft" : "failed"] : null;
  const banner = result ? BANNER[result] : null;

  return (
    <ScreenBody>
      <QuestionHeading
        ref={headingRef}
        title={checking ? `Checking your ${copy.noun}` : `Your ${copy.noun}`}
        sub={current ? <span className="wrap-anywhere">{current.fileName}</span> : undefined}
      />
      {previewUrl &&
        (kind === "video" ? (
          <video
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            className={cn("w-full rounded-2xl bg-muted object-contain", landscape ? "aspect-video" : "max-h-96")}
          />
        ) : (
          <audio src={previewUrl} controls preload="metadata" className="w-full" />
        ))}
      {checking ? (
        <Alert variant="info">
          <AlertDescription className="flex items-center gap-2">
            <Spinner className="size-4" aria-hidden />
            Checking your {copy.noun}…
          </AlertDescription>
        </Alert>
      ) : (
        banner && (
          <Alert variant={banner.variant} data-verdict={result}>
            <AlertTitle>{banner.title}</AlertTitle>
            <AlertDescription>{banner.body(copy.noun)}</AlertDescription>
          </Alert>
        )
      )}
      <CheckList checks={checks} />
      {inputs}
      {!checking && (
        <StickyActions>
          <ValidationMessage id={errorId} message={error ?? uploadError} />
          {result === "fail" ? (
            <>
              <Button
                className="w-full"
                onClick={() => {
                  retry("fail");
                  captureInput.current?.click();
                }}
              >
                {copy.again}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  retry("different_file");
                  uploadInput.current?.click();
                }}
              >
                Upload a different file
              </Button>
            </>
          ) : (
            <>
              <Button className="w-full" aria-describedby={error ? errorId : undefined} onClick={() => void use()}>
                Use this {copy.noun}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  retry(result ?? "pass");
                  if (!current) clearSelection();
                  captureInput.current?.click();
                }}
              >
                {copy.again}
              </Button>
            </>
          )}
        </StickyActions>
      )}
    </ScreenBody>
  );
}
