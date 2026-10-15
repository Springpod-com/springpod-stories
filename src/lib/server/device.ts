import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "wes_device";
const MAX_AGE_S = 30 * 24 * 60 * 60;

const hash = (id: string) => createHash("sha256").update(`device:${id}`).digest("hex");

/** Hash of this browser's device id, or null if it has none yet. */
export async function currentDeviceHash(): Promise<string | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  return id ? hash(id) : null;
}

/** Hash of this browser's device id, creating the HTTP-only cookie if needed. Route handlers only. */
export async function ensureDeviceHash(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = randomBytes(24).toString("base64url");
    jar.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
      path: "/",
      maxAge: MAX_AGE_S,
    });
  }
  return hash(id);
}
