-- Step 1: Add INITIATED status and tiered file retention backfill for work_requests

alter table public.work_requests
  drop constraint work_requests_status_check;

alter table public.work_requests
  add constraint work_requests_status_check
  check (status in ('INITIATED', 'DRAFT_AWAITING_ADVANCE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'));

-- Tiered retention backfill:
-- 1) Abandoned INITIATED / DRAFT_AWAITING_ADVANCE requests expire 24h after creation if not yet scheduled
update public.work_requests
set files_expire_at = created_at + interval '24 hours'
where status in ('INITIATED', 'DRAFT_AWAITING_ADVANCE')
  and files_expire_at is null;

-- 2) CANCELED requests retain files for 24h after cancellation (if not already purged)
update public.work_requests
set files_expire_at = coalesce(terminal_at, updated_at) + interval '24 hours'
where status = 'CANCELED'
  and files_purged_at is null;
