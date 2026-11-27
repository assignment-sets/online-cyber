04 — Upload Lifecycle, Request States & Tiered Asset Retention

This document specifies how customer file uploads, request state transitions, and automatic Cloudflare R2 asset cleanup work end-to-end. Every newly onboarded agent should treat this alongside 01–03 as authoritative architecture.

1. Architectural Rationale (Why No Pre-Submit Upload, Why No Redis Queue)

- Zero Backend File Bandwidth: Customer input files and Admin deliverable files NEVER pass through Next.js / Vercel Route Handlers. All binary transfers occur directly between the browser and Cloudflare R2 using short-lived presigned URLs.
- Zero Untracked R2 Orphans (Upload-on-Submit): Files are held locally in the browser until the user clicks Submit. The backend creates and tracks the `work_requests` row (`INITIATED`) before issuing batch presigned PUT URLs, so abandoned uploads always have a tracked database record and expiration timestamp.
- Single Cron Job Over External Queues: No Redis, BullMQ, or external queue infrastructure is used. A single daily Vercel Cron job (`GET /api/cron/purge-expired-files`, configured in `vercel.json`) sweeps expired R2 prefixes by `files_expire_at <= now()`.

2. Request State Machine (6 Statuses)

Status Flow:
- With files, Total < ₹500:  (Submit) -> INITIATED -> (R2 PUTs + /finalize) -> PENDING -> IN_PROGRESS -> COMPLETED | CANCELED
- With files, Total >= ₹500: (Submit) -> INITIATED -> (R2 PUTs + /finalize) -> DRAFT_AWAITING_ADVANCE -> (50% Advance Payment) -> PENDING -> IN_PROGRESS -> COMPLETED | CANCELED
- Zero files, Total < ₹500:  (Submit) -> PENDING -> IN_PROGRESS -> COMPLETED | CANCELED
- Zero files, Total >= ₹500: (Submit) -> DRAFT_AWAITING_ADVANCE -> (50% Advance Payment) -> PENDING -> IN_PROGRESS -> COMPLETED | CANCELED

Status Reference:
- `INITIATED`: Created on `POST /api/requests` when files are present; holds server-validated `expectedUploads` manifest in `service_snapshot` and `files_expire_at = created_at + 24h`. Hidden from the default `/admin` queue. `token = null`.
- `DRAFT_AWAITING_ADVANCE`: Customer submitted a job with total >= ₹500 (`50000` paise) and files (if any) are uploaded, awaiting 50% advance payment (`files_expire_at = now + 24h`). Hidden from the default `/admin` queue. `token = null`.
- `PENDING`: Confirmed job waiting for staff (`token` issued as `OC-XXXXXX`, `files_expire_at = null`). Visible in `/admin` queue.
- `IN_PROGRESS`: Staff actively processing the request (`files_expire_at = null`). Visible in `/admin` queue.
- `COMPLETED`: Terminal state (`terminal_at = now()`, `files_expire_at = terminal_at + 14 days`). Visible in `/admin` queue and customer `/track/[token]`.
- `CANCELED`: Terminal state with mandatory `cancellation_reason` (`terminal_at = now()`, `files_expire_at = terminal_at + 24 hours`). Visible in `/admin` queue and customer `/track/[token]`.

3. Three-Phase Upload-on-Submit Flow

Phase A — Validate Metadata & Initiate (`POST /api/requests`):
1. Browser collects all form inputs and validates selected files locally (MIME type, per-file size cap, max file count) with zero network requests on file selection.
2. On Submit, browser sends JSON metadata only (`serviceSlug`, contact info, `formData`, and `files: [{ clientFileId, fieldKey, originalFilename, mimeType, sizeBytes }]`) to `POST /api/requests`.
3. Backend validates contact info, form fields, and all pending file descriptors against the active service schema (`validateWorkRequestInitiation`). Any invalid field or file constraint returns HTTP `400` with `fieldErrors` before any R2 URL is signed or DB row is written.
4. If valid and `files.length > 0`, backend generates `requestId` (`UUID`), inserts `work_requests` in `INITIATED` (`files_expire_at = now + 24h`, `storage_prefix = requests/<requestId>`), stores `expectedUploads` inside `service_snapshot`, and returns batch presigned PUT URLs (`uploadTargets`).

Phase B — Direct Browser-to-R2 Parallel Upload:
1. Browser streams files directly to each target's R2 presigned `uploadUrl` using `PUT` with bounded concurrency (`5` concurrent uploads) and live progress (`Uploading X of Y files…`).
2. If any `PUT` fails, the failed targets remain retryable in UI state without re-creating a duplicate `work_requests` row.

Phase C — Finalize & Advance Gating (`POST /api/requests/[id]/finalize`):
1. Once all `PUT` uploads succeed, browser calls `POST /api/requests/[id]/finalize` with `{ uploadedStorageKeys }`.
2. Backend verifies `status === 'INITIATED'`, `files_purged_at === null`, and that `uploadedStorageKeys` matches `service_snapshot.expectedUploads` 1-to-1.
3. Backend inserts `request_files` (`direction = 'input'`) rows and transitions `work_requests`:
   - Total < ₹500 (`advance_required_paise === 0`): transitions to `PENDING`, issues unique `token`, and clears `files_expire_at = null`.
   - Total >= ₹500 (`advance_required_paise > 0`): transitions to `DRAFT_AWAITING_ADVANCE` and sets `files_expire_at = now + 24h`. When `POST /api/payments/checkout` completes the 50% advance (`SUCCESS`), it issues `token`, transitions to `PENDING`, and clears `files_expire_at = null`.

4. Tiered Asset Retention & Daily Cron Cleanup

Retention Rules by Status (source of truth: `lib/domain/retention.ts`):
- `INITIATED` (incomplete / closed tab mid-upload): Purge R2 folder after **24 hours**.
- `DRAFT_AWAITING_ADVANCE` (never paid 50% advance): Purge R2 folder after **24 hours**.
- `CANCELED` (defective assets / rejected): Purge R2 folder after **24 hours** from `terminal_at` (gives staff 1 day to reference files during offline phone/WhatsApp follow-up).
- `COMPLETED`: Purge R2 folder after **14 days** from `terminal_at` (gives customer 14 days to settle balance and download deliverables).
- `PENDING` / `IN_PROGRESS`: **Never purged** while active (`files_expire_at = null`).

Cron Sweep Mechanics (`/api/cron/purge-expired-files`):
- Scheduled daily via `vercel.json` (`0 2 * * *`) and authenticated via `Authorization: Bearer <CRON_SECRET>` using timing-safe comparison.
- Queries `work_requests` where `status IN ('INITIATED', 'DRAFT_AWAITING_ADVANCE', 'CANCELED', 'COMPLETED') AND files_expire_at <= now() AND files_purged_at IS NULL` (batch limit `100`).
- Calls `deleteRequestFolder(storage_prefix)` to remove all objects under `requests/<requestId>/` in R2, then stamps `files_purged_at = now()`.
- **Permanent Audit Ledger:** Postgres rows (`work_requests`, `payments`, `token`, customer contact, `cancellation_reason`, timestamps) are NEVER deleted by the purge job.

5. Admin Terminal Rules & Guards

- Default Queue Filtering: `GET /api/admin/requests` excludes `INITIATED` and `DRAFT_AWAITING_ADVANCE` by default so staff only see actionable jobs unless they explicitly filter by those statuses or `ALL`.
- Transition Guards: Staff cannot mark an `INITIATED` or `DRAFT_AWAITING_ADVANCE` request as `IN_PROGRESS` or `COMPLETED`, and cannot issue deliverable upload URLs (`POST /api/admin/requests/[id]/deliverables/upload-url`) for `INITIATED`, `DRAFT_AWAITING_ADVANCE`, or `CANCELED` requests.
- Purged State Display: Both `/track/[token]` and `/admin` check `files_purged_at !== null` to display clear retention-purged notices instead of generating dead download links.
