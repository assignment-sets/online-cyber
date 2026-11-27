import crypto from "node:crypto";
import { connection, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { PURGEABLE_STATUSES } from "@/lib/domain/retention";
import { logger } from "@/lib/logger";
import { deleteRequestFolder } from "@/lib/storage/r2";

const BATCH_LIMIT = 100;

interface ExpiredWorkRequestRow {
  id: string;
  token: string | null;
  storage_prefix: string;
  status: string;
  files_expire_at: string | null;
}

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const providedBuf = Buffer.from(authHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Purges expired object storage folders for purgeable work requests past their tiered retention window
 * (24h for INITIATED, DRAFT_AWAITING_ADVANCE, CANCELED; 14d for COMPLETED),
 * marking `files_purged_at` while preserving all database audit metadata.
 */
async function handlePurgeExpiredFiles(request: NextRequest) {
  await connection();

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();

    const { data, error: queryError } = await supabase
      .from("work_requests")
      .select("id, token, storage_prefix, status, files_expire_at")
      .in("status", [...PURGEABLE_STATUSES])
      .lte("files_expire_at", nowIso)
      .is("files_purged_at", null)
      .order("files_expire_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (queryError) {
      logger.error("Failed to query expired work requests for purge", {
        error: queryError.message,
      });
      return NextResponse.json(
        { error: "Failed to query expired work requests." },
        { status: 500 }
      );
    }

    const candidates = (data ?? []) as ExpiredWorkRequestRow[];
    let purgedCount = 0;
    let deletedObjectsTotal = 0;
    const failedIds: string[] = [];

    for (const req of candidates) {
      try {
        const { deletedCount } = await deleteRequestFolder(req.storage_prefix);
        const purgedAt = new Date().toISOString();

        const { error: updateError } = await supabase
          .from("work_requests")
          .update({ files_purged_at: purgedAt })
          .eq("id", req.id)
          .is("files_purged_at", null);

        if (updateError) {
          throw new Error(updateError.message);
        }

        purgedCount += 1;
        deletedObjectsTotal += deletedCount;
      } catch (err) {
        failedIds.push(req.id);
        logger.error("Failed to purge expired request files", {
          requestId: req.id,
          token: req.token,
          storagePrefix: req.storage_prefix,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = {
      processedCount: candidates.length,
      purgedCount,
      deletedObjectsTotal,
      failedIds,
    };

    logger.info("Completed expired files purge cron run", summary);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in expired files purge cron", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to run expired files purge." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handlePurgeExpiredFiles(request);
}

export async function POST(request: NextRequest) {
  return handlePurgeExpiredFiles(request);
}
