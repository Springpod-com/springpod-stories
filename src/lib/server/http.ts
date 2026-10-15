import "server-only";
import { NextResponse } from "next/server";

/**
 * Rejects cross-site writes: the Origin header, when present, must be this site. "This site" is
 * the host the browser asked for (Host, or X-Forwarded-Host behind a proxy) or APP_URL's host,
 * not `request.url`, which is the server's own bind address in the standalone server.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const ours = new Set<string>();
  const add = (host: string | null | undefined) => host && ours.add(host.split(",")[0]!.trim().toLowerCase());
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  try {
    add(new URL(request.url).host);
    if (process.env.APP_URL) add(new URL(process.env.APP_URL).host);
    return ours.has(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}

export const jsonError = (status: number, code: string, message?: string) =>
  NextResponse.json({ error: code, message }, { status });
