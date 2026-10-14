import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/lib/server/db";

/**
 * Staff sign-in for /admin (PRD 11, build plan section 12): Google Workspace single sign-on,
 * limited to the Springpod domain and to people with an active StaffUser row, which gives the
 * role. Sessions are signed cookies (JWT), so Auth.js needs no tables.
 *
 * Until the Google OAuth client is set up, a development sign-in (email only) can be turned on
 * with ADMIN_DEV_LOGIN=1. It only ever works when APP_URL is localhost.
 */

declare module "next-auth" {
  interface Session {
    staff: { id: string; email: string; name: string | null; role: "moderator" | "content" };
  }
}

const SESSION_HOURS = 8;

export const staffDomain = () => (process.env.STAFF_EMAIL_DOMAIN ?? "springpod.com").toLowerCase();

export const devLoginEnabled = () =>
  process.env.ADMIN_DEV_LOGIN === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.APP_URL ?? "");

const activeStaff = (email: string | null | undefined) =>
  email ? db.staffUser.findFirst({ where: { email: email.trim().toLowerCase(), active: true } }) : null;

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_HOURS * 60 * 60 },
  pages: { signIn: "/admin/sign-in", error: "/admin/sign-in" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID
      ? [Google({ authorization: { params: { hd: staffDomain(), prompt: "select_account" } } })]
      : []),
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev",
            name: "Development sign-in",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              const staff = await activeStaff(String(credentials?.email ?? ""));
              return staff ? { id: staff.id, email: staff.email, name: staff.name } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase() ?? "";
      if (account?.provider === "google") {
        // Google must vouch for the address, and it must be on the Springpod domain.
        const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
        if (!verified || !email.endsWith(`@${staffDomain()}`)) return false;
      }
      return Boolean(await activeStaff(email));
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const staff = await activeStaff(user.email);
        if (staff) token.staff = { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
      }
      return token;
    },
    async session({ session, token }) {
      return { ...session, staff: token.staff as DefaultSession["user"] & typeof session.staff };
    },
  },
}));
