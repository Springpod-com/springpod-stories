// Uploads a file straight to private storage in parts (PRD 7). Each part is retried with backoff,
// waits for the connection to come back if the phone goes offline, and gets a fresh signed link
// if its link has expired. Built on fetch and XMLHttpRequest (for progress) rather than a library.

import type { MediaKind } from "./checks";
import type { CreatedMedia } from "./schema";

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

export class UploadError extends Error {
  constructor(
    readonly code: "rejected" | "no_draft" | "failed" | "cancelled",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface Upload {
  /** Known once the server has accepted the upload. */
  mediaId: Promise<string>;
  /** Resolves when the file is stored and queued for checks. */
  done: Promise<string>;
  cancel(): void;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json.error === "rejected" || json.error === "no_draft" ? json.error : "failed";
    throw Object.assign(new UploadError(code, json.message), { status: res.status });
  }
  return json as T;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new UploadError("cancelled"));
    });
  });

const online = (signal: AbortSignal) =>
  navigator.onLine
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        window.addEventListener("online", () => resolve(), { once: true });
        signal.addEventListener("abort", () => reject(new UploadError("cancelled")));
      });

/** PUTs one part and returns its ETag. Rejects with the HTTP status on failure. */
function putPart(url: string, body: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(Object.assign(new Error(`Part upload failed: ${xhr.status}`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(new Error("Network error"), { status: 0 }));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new UploadError("cancelled"));
    xhr.send(body);
  });
}

export function startUpload(file: File, kind: MediaKind, onProgress?: (fraction: number) => void): Upload {
  const controller = new AbortController();
  const { signal } = controller;
  let resolveId!: (id: string) => void;
  let rejectId!: (e: unknown) => void;
  const mediaId = new Promise<string>((res, rej) => {
    resolveId = res;
    rejectId = rej;
  });
  // Callers may only await `done`; don't report an unhandled rejection for the id as well.
  mediaId.catch(() => undefined);

  const done = (async () => {
    let created: CreatedMedia;
    try {
      created = await api<CreatedMedia>("/api/media", {
        kind,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (e) {
      rejectId(e);
      throw e;
    }
    resolveId(created.mediaId);
    const base = `/api/media/${created.mediaId}`;

    const loaded = new Map<number, number>();
    const report = () => onProgress?.([...loaded.values()].reduce((a, b) => a + b, 0) / Math.max(1, file.size));
    const urls = new Map<number, string>();
    const fetchUrls = async (partNumbers: number[]) => {
      const { parts } = await api<{ parts: { partNumber: number; url: string }[] }>(`${base}/parts`, { partNumbers });
      for (const p of parts) urls.set(p.partNumber, p.url);
    };
    const all = Array.from({ length: created.partCount }, (_, i) => i + 1);
    await fetchUrls(all);

    const uploadPart = async (n: number) => {
      const blob = file.slice((n - 1) * created.partSize, n * created.partSize);
      for (let attempt = 1; ; attempt++) {
        if (signal.aborted) throw new UploadError("cancelled");
        await online(signal);
        try {
          const etag = await putPart(urls.get(n)!, blob, signal, (l) => {
            loaded.set(n, l);
            report();
          });
          loaded.set(n, blob.size);
          report();
          return { partNumber: n, etag };
        } catch (e) {
          if (e instanceof UploadError || attempt >= MAX_ATTEMPTS) throw e instanceof UploadError ? e : new UploadError("failed");
          loaded.set(n, 0);
          // An expired or refused link: ask for a fresh one before trying again.
          if ((e as { status?: number }).status === 403) await fetchUrls([n]);
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) * (0.75 + Math.random() / 2), signal);
        }
      }
    };

    const queue = [...all];
    const parts: { partNumber: number; etag: string }[] = [];
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let n = queue.shift(); n !== undefined; n = queue.shift()) parts.push(await uploadPart(n));
        }),
      );
    } catch (e) {
      // One part gave up: stop the others.
      controller.abort();
      throw e;
    }
    await api(`${base}/complete`, { parts });
    return created.mediaId;
  })();

  return { mediaId, done, cancel: () => controller.abort() };
}

/** The server's view of a file: status, checks, transcript and signed playback links. */
export async function fetchMedia(mediaId: string): Promise<import("./schema").MediaView | null> {
  const res = await fetch(`/api/media/${mediaId}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}
