import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  type IdRouteContext,
} from "../../_utils";

/**
 * DELETE /api/admin/staff/[id]
 * Owner-only endpoint to delete an admin account (prevents deleting self or any owner).
 */
export async function DELETE(
  _request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    const owner = await requireOwner();

    const { id } = await context.params;
    const staffId = id.trim();
    if (!staffId) {
      throw new BadRequestError("Staff ID is required.");
    }

    if (staffId === owner.staffId) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: target, error: fetchError } = await supabase
      .from("staff_users")
      .select("id, role")
      .eq("id", staffId)
      .maybeSingle();

    if (fetchError) {
      if (isPostgresErrorCode(fetchError, "22P02")) {
        throw new BadRequestError("Invalid staff ID format.");
      }
      throw new Error(`Failed to fetch staff account: ${fetchError.message}`);
    }

    if (!target) {
      return NextResponse.json(
        { error: "Staff account not found." },
        { status: 404 }
      );
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner accounts cannot be deleted." },
        { status: 403 }
      );
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("staff_users")
      .delete()
      .eq("id", staffId)
      .eq("role", "admin")
      .select("id")
      .maybeSingle();

    if (deleteError) {
      throw new Error(`Failed to delete staff account: ${deleteError.message}`);
    }

    if (!deleted) {
      return NextResponse.json(
        { error: "Staff account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
