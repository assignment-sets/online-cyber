import { connection, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { handleAdminRouteError } from "../_utils";

/**
 * GET /api/admin/payments
 * Lists payment records joined with work_requests metadata ordered by created_at desc (limit 200).
 */
export async function GET(): Promise<NextResponse> {
  try {
    await connection();
    await requireStaff();

    const supabase = getSupabaseAdmin();
    const { data: payments, error } = await supabase
      .from("payments")
      .select(
        "*, work_requests(token, customer_phone, customer_email, status, total_amount_paise, advance_required_paise, amount_paid_paise, service_snapshot)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`Failed to fetch payments history: ${error.message}`);
    }

    return NextResponse.json({ payments: payments ?? [] }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
