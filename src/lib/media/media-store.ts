// The file being checked and uploaded, kept outside React so it survives moving between the
// capture, tips and transcript screens. One file at a time: choosing another replaces it.

import { useSyncExternalStore } from "react";
import { CHECK_ORDER, LABELS, evaluateChecks, quickChecks, verdict, type Check, type MediaKind, type Verdict } from "./checks";
import { measure } from "./analyse";
import { startUpload, UploadError, type Upload } from "./upload";

export type UploadStatus = "idle" | "uploading" | "done" | "error";

export interface MediaSelection {
  /** Increases with each file, so late results for an old file are ignored. */
  seq: number;
  kind: MediaKind;
  file: File;
  fileName: string;
  checking: boolean;
  checks: Check[];
  verdict: Verdict | null;
  previewUrl: string | null;
  previewable: boolean;
  landscape: boolean;
  upload: {
    status: UploadStatus;
    progress: number;
    mediaId: string | null;
    error: UploadError["code"] | null;
    message: string | null;
  };
}

let selection: MediaSelection | null = null;
let upload: Upload | null = null;
let seq = 0;
/** Read through a function: the upload changes while `chooseFile` awaits. */
const activeUpload = (): Upload | null => upload;
const listeners = new Set<() => void>();

function set(next: MediaSelection | null) {
  selection = next;
  for (const l of listeners) l();
}

function patch(at: number, change: (s: MediaSelection) => MediaSelection) {
  if (selection && selection.seq === at) set(change(selection));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMediaSelection(): MediaSelection | null {
  return useSyncExternalStore(subscribe, () => selection, () => null);
}

export const getMediaSelection = () => selection;

function beginUpload(at: number, file: File, kind: MediaKind) {
  upload?.cancel();
  const current = startUpload(file, kind, (progress) =>
    patch(at, (s) => ({ ...s, upload: { ...s.upload, progress } })),
  );
  upload = current;
  patch(at, (s) => ({ ...s, upload: { status: "uploading", progress: 0, mediaId: null, error: null, message: null } }));
  current.mediaId.then(
    (mediaId) => patch(at, (s) => ({ ...s, upload: { ...s.upload, mediaId } })),
    () => undefined,
  );
  current.done.then(
    () => patch(at, (s) => ({ ...s, upload: { ...s.upload, status: "done", progress: 1 } })),
    (e: unknown) => {
      const err = e instanceof UploadError ? e : new UploadError("failed");
      if (err.code === "cancelled") return;
      patch(at, (s) => ({ ...s, upload: { ...s.upload, status: "error", error: err.code, message: err.message } }));
    },
  );
}

/** Saves what the browser measured once the server knows the file. */
async function sendBrowserChecks(mediaId: string, s: MediaSelection, facts: { durationS: number | null; width: number | null; height: number | null }) {
  await fetch(`/api/media/${mediaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts, browserChecks: s.checks }),
  }).catch(() => undefined);
}

/**
 * Checks a chosen file (PRD 7.1). The upload starts as soon as the file type and size pass,
 * so it is usually done by the time the person has watched it back.
 */
export async function chooseFile(file: File, kind: MediaKind) {
  const at = ++seq;
  if (selection?.previewUrl) URL.revokeObjectURL(selection.previewUrl);
  upload?.cancel();
  upload = null;

  const quick = quickChecks({ kind, mimeType: file.type, fileName: file.name, sizeBytes: file.size });
  const pending: Check[] = CHECK_ORDER[kind].map((id) => ({
    id,
    label: LABELS[id],
    state: quick[id]?.state ?? "pending",
    detail: quick[id]?.detail ?? "",
  }));
  set({
    seq: at,
    kind,
    file,
    fileName: file.name,
    checking: true,
    checks: pending,
    verdict: null,
    previewUrl: null,
    previewable: false,
    landscape: false,
    upload: { status: "idle", progress: 0, mediaId: null, error: null, message: null },
  });

  const quickFail = Object.values(quick).some((c) => c?.state === "fail");
  if (!quickFail) beginUpload(at, file, kind);

  const measured = await measure(file, kind);
  if (selection?.seq !== at) {
    URL.revokeObjectURL(measured.previewUrl);
    return;
  }
  const checks = evaluateChecks(measured.facts);
  const result = verdict(checks);
  patch(at, (s) => ({
    ...s,
    checking: false,
    checks,
    verdict: result,
    previewUrl: measured.previewUrl,
    previewable: measured.previewable,
    landscape: (measured.facts.width ?? 0) > (measured.facts.height ?? 0),
  }));

  if (result === "fail") {
    // Nothing to keep: stop the upload and remove anything already stored.
    activeUpload()?.cancel();
    const id = selection?.upload.mediaId;
    if (id) void fetch(`/api/media/${id}`, { method: "DELETE" }).catch(() => undefined);
    patch(at, (s) => ({ ...s, upload: { status: "idle", progress: 0, mediaId: null, error: null, message: null } }));
    return;
  }
  const facts = { durationS: measured.facts.durationS, width: measured.facts.width ?? null, height: measured.facts.height ?? null };
  activeUpload()?.mediaId.then((id) => selection && sendBrowserChecks(id, selection, facts)).catch(() => undefined);
}

/** "Try again" after an upload gave up. */
export function retryUpload() {
  if (!selection) return;
  beginUpload(selection.seq, selection.file, selection.kind);
}

/** Forgets the file, for "Film again" after the server turned it down, or a change of format. */
export function clearSelection() {
  seq++;
  upload?.cancel();
  upload = null;
  if (selection?.previewUrl) URL.revokeObjectURL(selection.previewUrl);
  set(null);
}

/** The id the server gave the current file, once the upload has started. */
export function chosenMediaId(): Promise<string> {
  const current = activeUpload();
  return current ? current.mediaId : Promise.reject(new UploadError("failed"));
}
