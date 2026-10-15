import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** For the load balancer: the app is up and can reach the database. Says nothing else. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
