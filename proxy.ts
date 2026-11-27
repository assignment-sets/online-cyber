import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

const LOGIN_PATH = "/admin/login";

/**
 * Next.js 16 Proxy performing an optimistic session cookie check on `/admin/*` routes.
 * Full database-backed authorization is enforced in `requireStaff()` / `requireOwner()`.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
