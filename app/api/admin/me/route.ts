import { connection, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { handleAdminRouteError } from "../_utils";

/**
 * GET /api/admin/me
 * Returns the currently authenticated staff session.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await connection();
    const staff = await requireStaff();
    return NextResponse.json({ staff }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
