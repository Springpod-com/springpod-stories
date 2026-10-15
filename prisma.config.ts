import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Read directly (not with env()) so `prisma generate` works on install without a database URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
