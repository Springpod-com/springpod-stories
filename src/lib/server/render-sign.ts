import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed links for the quote card render page, so only the worker can open it (build plan section
 * 10, `quote-card-render`). The signature covers the story, the shape and an expiry time.
 */
const secret = () => {
  const s = process.env.RENDER_SECRET ?? process.env.AUTH_SECRET;
  if (!s) throw new Error("RENDER_SECRET or AUTH_SECRET must be set to render quote cards");
  return s;
};

const sign = (storyId: string, shape: string, exp: number) =>
  createHmac("sha256", secret()).update(`${storyId}:${shape}:${exp}`).digest("base64url");

export function renderQuery(storyId: string, shape: "portrait" | "story", ttlS = 120): string {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  return `shape=${shape}&exp=${exp}&sig=${sign(storyId, shape, exp)}`;
}

export function verifyRender(storyId: string, shape: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(storyId, shape, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
