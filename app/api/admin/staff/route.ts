import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { requireOwner } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import {
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
} from "../_utils";

const USERNAME_REGEX = /^[a-z0-9_.-]+$/i;

const CreateStaffBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(40, "Username cannot exceed 40 characters.")
    .regex(
      USERNAME_REGEX,
      "Username may only contain letters, numbers, underscores, dots, and hyphens."
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

const STAFF_PUBLIC_COLUMNS = "id, username, role, is_active, created_at, created_by";

/**
 * GET /api/admin/staff
 * Owner-only endpoint listing staff accounts without exposing password hashes.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await connection();
    await requireOwner();

    const supabase = getSupabaseAdmin();
    const { data: staff, error } = await supabase
      .from("staff_users")
      .select(STAFF_PUBLIC_COLUMNS)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list staff accounts: ${error.message}`);
    }

    return NextResponse.json({ staff: staff ?? [] }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}

/**
 * POST /api/admin/staff
 * Owner-only endpoint to create a new admin staff account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const owner = await requireOwner();

    const body = await parseJsonBody(request);
    const { username, password } = CreateStaffBodySchema.parse(body);

    const passwordHash = await hashPassword(password);

    const supabase = getSupabaseAdmin();
    const { data: staff, error } = await supabase
      .from("staff_users")
      .insert({
        username,
        password_hash: passwordHash,
        role: "admin",
        is_active: true,
        created_by: owner.staffId,
      })
      .select(STAFF_PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (isPostgresErrorCode(error, "23505")) {
        return NextResponse.json(
          {
            error: "Username is already taken.",
            fieldErrors: { username: ["Username is already taken."] },
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to create staff account: ${error.message}`);
    }

    return NextResponse.json({ staff }, { status: 201 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
