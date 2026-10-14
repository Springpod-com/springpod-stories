// Adds or updates a staff member: pnpm staff:add <email> <moderator|content> [name]
// Staff can sign in to /admin only if they are on this list and active (build plan section 12).
import "dotenv/config";
import { db } from "@/lib/server/db";

const [email, role = "moderator", ...name] = process.argv.slice(2);
if (!email || !["moderator", "content"].includes(role)) {
  console.error("Usage: pnpm staff:add <email> <moderator|content> [name]");
  process.exit(1);
}
const staff = await db.staffUser.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), role: role as "moderator" | "content", name: name.join(" ") || null },
  update: { role: role as "moderator" | "content", active: true, ...(name.length ? { name: name.join(" ") } : {}) },
});
console.log(`Staff ${staff.email} is a ${staff.role}`);
await db.$disconnect();
