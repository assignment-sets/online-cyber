import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import type { TablesUpdate } from "@/lib/db/database.types";
import { computeFilesExpireAt } from "@/lib/domain/retention";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
  type IdRouteContext,
} from "../../../_utils";

const UpdateRequestStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELED"]),
  cancellationReason: z.string().trim().max(1000).optional(),
});

function isServiceCollectibleOnline(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const record = snapshot as Record<string, unknown>;
  return (
    record.isCollectibleOnline === true ||
    record.is_collectible_online === true
  );
}

/**
 * PATCH /api/admin/requests/[id]/status
 * Transitions a work request to IN_PROGRESS, COMPLETED, or CANCELED with strict guards.
 */
export async function PATCH(
  request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    await requireStaff();

    const { id } = await context.params;
    const requestId = id.trim();
    if (!requestId) {
      throw new BadRequestError("Request ID is required.");
    }

    const body = await parseJsonBody(request);
    const { status: targetStatus, cancellationReason } =
      UpdateRequestStatusSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await supabase
      .from("work_requests")
      .select("id, status, service_snapshot")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError) {
      if (isPostgresErrorCode(fetchError, "22P02")) {
        throw new BadRequestError("Invalid request ID format.");
      }
      throw new Error(`Failed to fetch work request: ${fetchError.message}`);
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    if (
      existing.status === "COMPLETED" ||
      existing.status === "CANCELED"
    ) {
      return NextResponse.json(
        {
          error: `Cannot transition request out of terminal status ${existing.status}.`,
          fieldErrors: {
            status: [`Request is already ${existing.status}.`],
          },
        },
        { status: 400 }
      );
    }

    if (
      existing.status === "INITIATED" &&
      (targetStatus === "IN_PROGRESS" || targetStatus === "COMPLETED")
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot process or complete an incomplete request before uploads finish.",
          fieldErrors: {
            status: ["Customer file uploads have not been finalized."],
          },
        },
        { status: 400 }
      );
    }

    if (
      existing.status === "DRAFT_AWAITING_ADVANCE" &&
      (targetStatus === "IN_PROGRESS" || targetStatus === "COMPLETED")
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot process or complete a request before advance payment is completed.",
          fieldErrors: {
            status: ["Advance payment has not been received."],
          },
        },
        { status: 400 }
      );
    }

    if (targetStatus === "CANCELED") {
      const trimmedReason = cancellationReason?.trim() ?? "";
      if (trimmedReason.length < 3) {
        return NextResponse.json(
          {
            error: "Cancellation reason must be at least 3 characters.",
            fieldErrors: {
              cancellationReason: [
                "Cancellation reason must be at least 3 characters.",
              ],
            },
          },
          { status: 400 }
        );
      }
    }

    if (
      targetStatus === "COMPLETED" &&
      isServiceCollectibleOnline(existing.service_snapshot)
    ) {
      const { data: outputFiles, error: filesError } = await supabase
        .from("request_files")
        .select("id")
        .eq("request_id", requestId)
        .eq("direction", "output")
        .limit(1);

      if (filesError) {
        throw new Error(
          `Failed to check request deliverables: ${filesError.message}`
        );
      }

      if (!outputFiles || outputFiles.length === 0) {
        return NextResponse.json(
          {
            error:
              "Upload at least one deliverable file before marking an online-collectible request COMPLETED.",
            fieldErrors: {
              status: [
                "At least one deliverable file must be uploaded first.",
              ],
            },
          },
          { status: 400 }
        );
      }
    }

    const updates: TablesUpdate<"work_requests"> = {
      status: targetStatus,
    };

    if (targetStatus === "COMPLETED" || targetStatus === "CANCELED") {
      const nowMs = Date.now();
      updates.terminal_at = new Date(nowMs).toISOString();
      updates.files_expire_at = computeFilesExpireAt(targetStatus, nowMs);
    }

    if (targetStatus === "CANCELED") {
      updates.cancellation_reason = cancellationReason!.trim();
    }

    const { data: updated, error: updateError } = await supabase
      .from("work_requests")
      .update(updates)
      .eq("id", requestId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update work request: ${updateError.message}`);
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ request: updated }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
