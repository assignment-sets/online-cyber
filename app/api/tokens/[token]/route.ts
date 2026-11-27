import { connection, NextRequest, NextResponse } from "next/server";
import type { Json } from "@/lib/db/database.types";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { normalizeWorkToken } from "@/lib/domain/tokens";
import { logger } from "@/lib/logger";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";

interface DeliverableDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

function parseServiceSnapshot(snapshot: Json): {
  serviceName: string;
  isCollectibleOnline: boolean;
} {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const record = snapshot as Record<string, unknown>;
    return {
      serviceName:
        typeof record.name === "string" && record.name.trim() !== ""
          ? record.name
          : "Service",
      isCollectibleOnline: record.isCollectibleOnline === true,
    };
  }

  return { serviceName: "Service", isCollectibleOnline: false };
}

/**
 * GET /api/tokens/[token] — Public work token status lookup.
 * Never leaks customer PII or input files; unlocks presigned deliverable download URLs
 * only when COMPLETED, fully paid (balanceDuePaise === 0), collectible online, and unpurged.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  await connection();

  try {
    const { token: rawToken } = await context.params;
    const normalizedToken = normalizeWorkToken(rawToken);

    if (!normalizedToken) {
      return NextResponse.json(
        { error: "Work token not found." },
        { status: 404 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: workRequest, error: requestError } = await supabase
      .from("work_requests")
      .select(
        "id, token, service_snapshot, status, submitted_while_closed, total_amount_paise, advance_required_paise, amount_paid_paise, cancellation_reason, files_purged_at, created_at, updated_at, terminal_at"
      )
      .eq("token", normalizedToken)
      .maybeSingle();

    if (requestError) {
      throw new Error(`Failed to query work token: ${requestError.message}`);
    }

    if (!workRequest) {
      return NextResponse.json(
        { error: "Work token not found." },
        { status: 404 }
      );
    }

    const balanceDuePaise = Math.max(
      0,
      workRequest.total_amount_paise - workRequest.amount_paid_paise
    );
    const { serviceName, isCollectibleOnline } = parseServiceSnapshot(
      workRequest.service_snapshot
    );

    let deliverables: DeliverableDto[] = [];

    if (
      workRequest.status === "COMPLETED" &&
      balanceDuePaise === 0 &&
      isCollectibleOnline &&
      workRequest.files_purged_at === null
    ) {
      const { data: outputFiles, error: filesError } = await supabase
        .from("request_files")
        .select("id, storage_key, original_filename, mime_type, size_bytes")
        .eq("request_id", workRequest.id)
        .eq("direction", "output")
        .order("created_at", { ascending: true });

      if (filesError) {
        throw new Error(
          `Failed to load deliverable files: ${filesError.message}`
        );
      }

      deliverables = await Promise.all(
        (outputFiles ?? []).map(async (file) => ({
          id: file.id,
          filename: file.original_filename,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          downloadUrl: await createPresignedDownloadUrl({
            storageKey: file.storage_key,
            downloadFilename: file.original_filename,
          }),
        }))
      );
    }

    return NextResponse.json(
      {
        token: workRequest.token,
        requestId: workRequest.id,
        serviceName,
        isCollectibleOnline,
        status: workRequest.status,
        submittedWhileClosed: workRequest.submitted_while_closed,
        totalAmountPaise: workRequest.total_amount_paise,
        advanceRequiredPaise: workRequest.advance_required_paise,
        amountPaidPaise: workRequest.amount_paid_paise,
        balanceDuePaise,
        cancellationReason: workRequest.cancellation_reason,
        filesPurgedAt: workRequest.files_purged_at,
        createdAt: workRequest.created_at,
        updatedAt: workRequest.updated_at,
        terminalAt: workRequest.terminal_at,
        deliverables,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Failed to look up work token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to look up work token." },
      { status: 500 }
    );
  }
}
