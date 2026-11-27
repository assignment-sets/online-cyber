import { NextResponse } from "next/server";
import { clearStaffSessionCookie } from "@/lib/auth/session";
import { handleAdminRouteError } from "../_utils";

/**
 * POST /api/admin/logout
 * Clears the admin session cookie.
 */
export async function POST(): Promise<NextResponse> {
  try {
    await clearStaffSessionCookie();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
