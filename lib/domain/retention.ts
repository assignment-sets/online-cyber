export const SHORT_RETENTION_HOURS = 24;
export const COMPLETED_RETENTION_DAYS = 14;

export const SHORT_RETENTION_MS = SHORT_RETENTION_HOURS * 60 * 60 * 1000;
export const COMPLETED_RETENTION_MS =
  COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const WORK_REQUEST_STATUSES = [
  "INITIATED",
  "DRAFT_AWAITING_ADVANCE",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;

export type WorkRequestStatus = (typeof WORK_REQUEST_STATUSES)[number];

/**
 * Statuses whose R2 storage folders are eligible for automatic cron cleanup
 * once `files_expire_at` is reached. Active statuses (`PENDING`, `IN_PROGRESS`)
 * never expire.
 */
export const PURGEABLE_STATUSES = [
  "INITIATED",
  "DRAFT_AWAITING_ADVANCE",
  "CANCELED",
  "COMPLETED",
] as const;

/**
 * Computes `files_expire_at` ISO timestamp for a given work request status,
 * or `null` when files must remain retained (active `PENDING` / `IN_PROGRESS`).
 */
export function computeFilesExpireAt(
  status: WorkRequestStatus,
  nowMs: number = Date.now()
): string | null {
  switch (status) {
    case "INITIATED":
    case "DRAFT_AWAITING_ADVANCE":
    case "CANCELED":
      return new Date(nowMs + SHORT_RETENTION_MS).toISOString();
    case "COMPLETED":
      return new Date(nowMs + COMPLETED_RETENTION_MS).toISOString();
    case "PENDING":
    case "IN_PROGRESS":
      return null;
  }
}
