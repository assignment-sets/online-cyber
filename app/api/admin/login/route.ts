import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { setStaffSessionCookie, signSessionToken } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { handleAdminRouteError, parseJsonBody } from "../_utils";

const LoginBodySchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

/**
 * POST /api/admin/login
 * Authenticates an active staff member and issues a signed HTTP-only session cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const { username, password } = LoginBodySchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data: staff, error } = await supabase
      .from("staff_users")
      .select("id, username, role, password_hash, is_active")
      .eq("username", username)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to query staff user: ${error.message}`);
    }

    if (!staff || staff.is_active !== true) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(password, staff.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    if (staff.role !== "owner" && staff.role !== "admin") {
      return NextResponse.json(
        { error: "Invalid staff role." },
        { status: 401 }
      );
    }

    const token = signSessionToken({
      staffId: staff.id,
      username: staff.username,
      role: staff.role,
    });
    await setStaffSessionCookie(token);

    return NextResponse.json(
      {
        staff: {
          id: staff.id,
          username: staff.username,
          role: staff.role,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
