import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // One client per process, reused across hot reloads in development.
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForPrisma.prisma;
}

/**
 * The database client. It connects on first use rather than on import, so building the app
 * (which loads route modules) works without a database.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const real = client();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Locks a story's row until the transaction ends, so two steps that move it on (the email
 * confirmation and the pre-screen, say) can't each miss the other's change.
 */
export async function lockStory(tx: Tx, storyId: string) {
  await tx.$queryRaw`SELECT id FROM "Story" WHERE id = ${storyId} FOR UPDATE`;
}
