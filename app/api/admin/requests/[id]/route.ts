import { connection, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  type IdRouteContext,
} from "../../_utils";

/**
 * GET /api/admin/requests/[id]
 * Fetches a single work request with presigned download URLs for input/output files and payments.
 */
export async function GET(
  _request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    await connection();
    await requireStaff();

    const { id } = await context.params;
    const requestId = id.trim();
    if (!requestId) {
      throw new BadRequestError("Request ID is required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: workRequest, error: requestError } = await supabase
      .from("work_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      if (isPostgresErrorCode(requestError, "22P02")) {
        throw new BadRequestError("Invalid request ID format.");
      }
      throw new Error(`Failed to fetch work request: ${requestError.message}`);
    }

    if (!workRequest) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    const [filesResult, paymentsResult] = await Promise.all([
      supabase
        .from("request_files")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true }),
      supabase
        .from("payments")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false }),
    ]);

    if (filesResult.error) {
      throw new Error(
        `Failed to fetch request files: ${filesResult.error.message}`
      );
    }
    if (paymentsResult.error) {
      throw new Error(
        `Failed to fetch request payments: ${paymentsResult.error.message}`
      );
    }

    const files = filesResult.data ?? [];
    const filesPurged = workRequest.files_purged_at !== null;

    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        downloadUrl: filesPurged
          ? null
          : await createPresignedDownloadUrl({
              storageKey: file.storage_key,
              downloadFilename: file.original_filename,
            }),
      }))
    );

    const inputFiles = filesWithUrls.filter(
      (file) => file.direction === "input"
    );
    const outputFiles = filesWithUrls.filter(
      (file) => file.direction === "output"
    );

    return NextResponse.json(
      {
        request: workRequest,
        inputFiles,
        outputFiles,
        payments: paymentsResult.data ?? [],
      },
      { status: 200 }
    );
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
