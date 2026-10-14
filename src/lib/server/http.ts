import "server-only";
import { NextResponse } from "next/server";

/** Rejects cross-site writes: the Origin header, when present, must match this host. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export const jsonError = (status: number, code: string, message?: string) =>
  NextResponse.json({ error: code, message }, { status });
