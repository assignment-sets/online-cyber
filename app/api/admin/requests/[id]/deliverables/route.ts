import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
  type IdRouteContext,
} from "../../../_utils";

const RegisterDeliverableBodySchema = z.object({
  storageKey: z.string().trim().min(1, "storageKey is required."),
  originalFilename: z
    .string()
    .trim()
    .min(1, "originalFilename is required.")
    .max(255, "originalFilename cannot exceed 255 characters."),
  mimeType: z
    .string()
    .trim()
    .min(1, "mimeType is required.")
    .max(120, "mimeType cannot exceed 120 characters.")
    .transform((value) => value.toLowerCase()),
  sizeBytes: z
    .number()
    .int("sizeBytes must be an integer.")
    .positive("sizeBytes must be positive."),
});

/**
 * POST /api/admin/requests/[id]/deliverables
 * Records an uploaded output deliverable in `request_files` for a work request.
 */
export async function POST(
  request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    const staff = await requireStaff();

    const { id } = await context.params;
    const requestId = id.trim();
    if (!requestId) {
      throw new BadRequestError("Request ID is required.");
    }

    const body = await parseJsonBody(request);
    const { storageKey, originalFilename, mimeType, sizeBytes } =
      RegisterDeliverableBodySchema.parse(body);

    const expectedPrefix = `requests/${requestId}/outputs/`;
    if (
      !storageKey.startsWith(expectedPrefix) ||
      storageKey.length <= expectedPrefix.length ||
      storageKey.includes("..") ||
      storageKey.includes("\\") ||
      storageKey.includes("//")
    ) {
      return NextResponse.json(
        {
          error: `storageKey must reside under "${expectedPrefix}".`,
          fieldErrors: {
            storageKey: [
              `storageKey must start with "${expectedPrefix}" and contain no traversal segments.`,
            ],
          },
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: workRequest, error: fetchError } = await supabase
      .from("work_requests")
      .select("id, status, files_purged_at")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError) {
      if (isPostgresErrorCode(fetchError, "22P02")) {
        throw new BadRequestError("Invalid request ID format.");
      }
      throw new Error(`Failed to fetch work request: ${fetchError.message}`);
    }

    if (!workRequest) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    if (
      workRequest.status === "CANCELED" ||
      workRequest.status === "DRAFT_AWAITING_ADVANCE"
    ) {
      return NextResponse.json(
        {
          error: `Cannot register deliverables for a request in ${workRequest.status} status.`,
        },
        { status: 400 }
      );
    }

    if (workRequest.files_purged_at !== null) {
      return NextResponse.json(
        { error: "Cannot register deliverables after request files have been purged." },
        { status: 400 }
      );
    }

    const { data: file, error: insertError } = await supabase
      .from("request_files")
      .insert({
        request_id: requestId,
        direction: "output",
        field_key: null,
        storage_key: storageKey,
        original_filename: originalFilename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        uploaded_by_staff_id: staff.staffId,
      })
      .select("*")
      .single();

    if (insertError) {
      if (isPostgresErrorCode(insertError, "23505")) {
        return NextResponse.json(
          {
            error: "A deliverable with this storageKey already exists.",
            fieldErrors: {
              storageKey: ["This storageKey is already registered."],
            },
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to record deliverable: ${insertError.message}`);
    }

    return NextResponse.json({ file }, { status: 201 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
