import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { BadRequestError, handleAdminRouteError } from "../_utils";

const RequestStatusFilterSchema = z.enum([
  "INITIATED",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "DRAFT_AWAITING_ADVANCE",
  "ALL",
]);

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoBoundary(
  raw: string,
  field: "from" | "to"
): string {
  const trimmed = raw.trim();
  if (DATE_ONLY_REGEX.test(trimmed)) {
    const suffix =
      field === "from" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const candidate = `${trimmed}${suffix}`;
    const timestamp = Date.parse(candidate);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestError(`Invalid '${field}' date.`, {
        [field]: [`Invalid '${field}' date.`],
      });
    }
    return new Date(timestamp).toISOString();
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    throw new BadRequestError(`Invalid '${field}' ISO date/datetime.`, {
      [field]: [`Invalid '${field}' ISO date/datetime.`],
    });
  }

  return new Date(timestamp).toISOString();
}

/**
 * GET /api/admin/requests
 * Lists work requests with status filtering, lost-token recovery search, and time window bounds.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await connection();
    await requireStaff();

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status")?.trim();
    const rawQuery = searchParams.get("q")?.trim();
    const rawFrom = searchParams.get("from")?.trim();
    const rawTo = searchParams.get("to")?.trim();

    const statusFilter = rawStatus
      ? RequestStatusFilterSchema.parse(rawStatus)
      : undefined;

    const fromIso = rawFrom ? parseIsoBoundary(rawFrom, "from") : undefined;
    const toIso = rawTo ? parseIsoBoundary(rawTo, "to") : undefined;

    if (fromIso && toIso && Date.parse(fromIso) > Date.parse(toIso)) {
      throw new BadRequestError("'from' must be before or equal to 'to'.", {
        from: ["'from' must be before or equal to 'to'."],
      });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase.from("work_requests").select("*");

    if (statusFilter === "ALL") {
      // No status constraint: return all statuses including drafts and initiated uploads.
    } else if (statusFilter) {
      query = query.eq("status", statusFilter);
    } else {
      query = query.not("status", "in", '("INITIATED","DRAFT_AWAITING_ADVANCE")');
    }

    if (rawQuery) {
      const sanitizedQ = rawQuery.replace(/[,()\\]/g, "").trim();
      if (sanitizedQ.length > 0) {
        const pattern = `%${sanitizedQ}%`;
        query = query.or(
          `token.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern}`
        );
      }
    }

    if (fromIso) {
      query = query.gte("created_at", fromIso);
    }
    if (toIso) {
      query = query.lte("created_at", toIso);
    }

    const { data: requests, error } = await query
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to list work requests: ${error.message}`);
    }

    return NextResponse.json({ requests: requests ?? [] }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
