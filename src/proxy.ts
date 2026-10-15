import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * First line of defence for the admin (build plan section 12): no session, no admin pages or
 * admin API. Every admin page and action checks the StaffUser row again.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin/sign-in")) return NextResponse.next();
  const session = await auth();
  if (session?.staff) return NextResponse.next();
  if (pathname.startsWith("/api/admin")) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.redirect(new URL("/admin/sign-in", req.nextUrl));
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
