import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import {
  buildObjectStorageKey,
  createPresignedUploadUrl,
} from "@/lib/storage/r2";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
  type IdRouteContext,
} from "../../../../_utils";

const MAX_DELIVERABLE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const DeliverableUploadUrlBodySchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Filename is required.")
    .max(255, "Filename cannot exceed 255 characters."),
  mimeType: z
    .string()
    .trim()
    .min(1, "MIME type is required.")
    .max(120, "MIME type cannot exceed 120 characters."),
  sizeBytes: z
    .number()
    .int("sizeBytes must be an integer.")
    .positive("sizeBytes must be positive.")
    .max(
      MAX_DELIVERABLE_SIZE_BYTES,
      `Deliverable size cannot exceed ${MAX_DELIVERABLE_SIZE_BYTES} bytes.`
    ),
});

/**
 * POST /api/admin/requests/[id]/deliverables/upload-url
 * Issues a presigned PUT URL for uploading a finished deliverable into the request's outputs folder.
 */
export async function POST(
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
    const { filename, mimeType, sizeBytes } =
      DeliverableUploadUrlBodySchema.parse(body);

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
      workRequest.status === "INITIATED" ||
      workRequest.status === "CANCELED" ||
      workRequest.status === "DRAFT_AWAITING_ADVANCE"
    ) {
      return NextResponse.json(
        {
          error: `Cannot upload deliverables for a request in ${workRequest.status} status.`,
        },
        { status: 400 }
      );
    }

    if (workRequest.files_purged_at !== null) {
      return NextResponse.json(
        { error: "Cannot upload deliverables after request files have been purged." },
        { status: 400 }
      );
    }

    const storageKey = buildObjectStorageKey({
      requestId,
      direction: "output",
      filename,
      fileId: crypto.randomUUID(),
    });

    const uploadUrl = await createPresignedUploadUrl({
      storageKey,
      contentType: mimeType,
      contentLength: sizeBytes,
    });

    return NextResponse.json({ uploadUrl, storageKey }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
