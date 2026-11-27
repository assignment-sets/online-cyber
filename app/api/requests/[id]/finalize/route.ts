import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { computeFilesExpireAt } from "@/lib/domain/retention";
import {
  ExpectedUploadItemSchema,
  type ExpectedUploadItem,
} from "@/lib/domain/service-schema";
import { generateWorkToken } from "@/lib/domain/tokens";
import type { FieldErrors } from "@/lib/domain/validation";
import { logger } from "@/lib/logger";

const MAX_TOKEN_UPDATE_ATTEMPTS = 5;

const RequestIdSchema = z.string().uuid("Request id must be a valid UUID.");

const FinalizeBodySchema = z.object({
  uploadedStorageKeys: z.array(
    z.string().min(1, "Storage key cannot be empty.")
  ),
});

function toFieldErrors(issues: z.ZodIssue[]): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "request";
    if (!fieldErrors[key]) {
      fieldErrors[key] = [issue.message];
    } else {
      fieldErrors[key].push(issue.message);
    }
  }
  return fieldErrors;
}

function isTokenUniqueCollision(error: {
  code?: string;
  message?: string;
  details?: string | null;
}): boolean {
  if (error.code !== "23505") {
    return false;
  }
  const combined = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return combined.includes("token");
}

function parseExpectedUploads(snapshot: unknown): ExpectedUploadItem[] | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const rawExpected = (snapshot as Record<string, unknown>).expectedUploads;
  const parsed = ExpectedUploadItemSchema.array().safeParse(rawExpected);
  if (!parsed.success || parsed.data.length === 0) {
    return null;
  }
  return parsed.data;
}

function matchesExpectedManifest(
  uploadedStorageKeys: string[],
  expectedUploads: ExpectedUploadItem[]
): boolean {
  const uploadedSet = new Set(uploadedStorageKeys);
  if (uploadedSet.size !== uploadedStorageKeys.length) {
    return false;
  }
  const expectedSet = new Set(expectedUploads.map((item) => item.storageKey));
  if (uploadedSet.size !== expectedSet.size) {
    return false;
  }
  for (const key of expectedSet) {
    if (!uploadedSet.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * POST /api/requests/[id]/finalize — Verifies uploaded storage keys against the
 * INITIATED request manifest, records `request_files`, and transitions to
 * PENDING (with Work Token and files_expire_at = null) or DRAFT_AWAITING_ADVANCE.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsedId = RequestIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: { id: [parsedId.error.issues[0]?.message ?? "Invalid UUID."] },
      },
      { status: 400 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsedBody = FinalizeBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: toFieldErrors(parsedBody.error.issues),
      },
      { status: 400 }
    );
  }

  const requestId = parsedId.data;
  const { uploadedStorageKeys } = parsedBody.data;

  try {
    const supabase = getSupabaseAdmin();
    const { data: workRequest, error: fetchError } = await supabase
      .from("work_requests")
      .select(
        "id, status, files_purged_at, service_snapshot, total_amount_paise, advance_required_paise, amount_paid_paise"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to load work request: ${fetchError.message}`);
    }

    if (!workRequest) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    if (
      workRequest.status !== "INITIATED" ||
      workRequest.files_purged_at !== null
    ) {
      return NextResponse.json(
        {
          error:
            "Request is not awaiting upload finalization or its upload window has expired.",
        },
        { status: 400 }
      );
    }

    const expectedUploads = parseExpectedUploads(workRequest.service_snapshot);
    if (
      !expectedUploads ||
      !matchesExpectedManifest(uploadedStorageKeys, expectedUploads)
    ) {
      return NextResponse.json(
        { error: "Uploaded files do not match expected upload manifest." },
        { status: 400 }
      );
    }

    const fileRows = expectedUploads.map((item) => ({
      request_id: requestId,
      direction: "input" as const,
      field_key: item.fieldKey,
      storage_key: item.storageKey,
      original_filename: item.originalFilename,
      mime_type: item.mimeType,
      size_bytes: item.sizeBytes,
    }));

    const { error: filesError } = await supabase
      .from("request_files")
      .insert(fileRows);

    if (filesError) {
      throw new Error(`Failed to record uploaded files: ${filesError.message}`);
    }

    if (workRequest.advance_required_paise === 0) {
      let issuedToken: string | null = null;
      let transitioned = false;

      for (let attempt = 0; attempt < MAX_TOKEN_UPDATE_ATTEMPTS; attempt += 1) {
        const candidateToken = generateWorkToken();
        const { data: updatedRow, error: updateError } = await supabase
          .from("work_requests")
          .update({
            status: "PENDING",
            token: candidateToken,
            files_expire_at: computeFilesExpireAt("PENDING"),
          })
          .eq("id", requestId)
          .eq("status", "INITIATED")
          .select("id")
          .maybeSingle();

        if (!updateError) {
          if (!updatedRow) {
            return NextResponse.json(
              { error: "Request is no longer awaiting upload finalization." },
              { status: 400 }
            );
          }
          issuedToken = candidateToken;
          transitioned = true;
          break;
        }

        if (!isTokenUniqueCollision(updateError)) {
          await supabase
            .from("request_files")
            .delete()
            .eq("request_id", requestId)
            .eq("direction", "input");
          throw new Error(
            `Failed to finalize work request: ${updateError.message}`
          );
        }
      }

      if (!transitioned || !issuedToken) {
        await supabase
          .from("request_files")
          .delete()
          .eq("request_id", requestId)
          .eq("direction", "input");
        throw new Error(
          "Failed to generate a unique work token after maximum retries."
        );
      }

      return NextResponse.json(
        {
          status: "PENDING",
          requiresAdvance: false,
          requestId,
          token: issuedToken,
          totalAmountPaise: workRequest.total_amount_paise,
          advanceRequiredPaise: 0,
          amountPaidPaise: 0,
        },
        { status: 200 }
      );
    }

    const { data: updatedDraft, error: draftUpdateError } = await supabase
      .from("work_requests")
      .update({
        status: "DRAFT_AWAITING_ADVANCE",
        files_expire_at: computeFilesExpireAt("DRAFT_AWAITING_ADVANCE"),
      })
      .eq("id", requestId)
      .eq("status", "INITIATED")
      .select("id")
      .maybeSingle();

    if (draftUpdateError) {
      await supabase
        .from("request_files")
        .delete()
        .eq("request_id", requestId)
        .eq("direction", "input");
      throw new Error(
        `Failed to finalize work request draft: ${draftUpdateError.message}`
      );
    }

    if (!updatedDraft) {
      return NextResponse.json(
        { error: "Request is no longer awaiting upload finalization." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        status: "DRAFT_AWAITING_ADVANCE",
        requiresAdvance: true,
        requestId,
        token: null,
        totalAmountPaise: workRequest.total_amount_paise,
        advanceRequiredPaise: workRequest.advance_required_paise,
        amountPaidPaise: 0,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Failed to finalize work request", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to finalize work request." },
      { status: 500 }
    );
  }
}
