-- Phase 1: Initial onlineCyber schema & backend-only lockdown
-- All database access happens exclusively from Next.js server routes/actions via SUPABASE_SECRET_KEY (service_role).

-- 1. Tables

create table public.shop_settings (
  id integer primary key default 1 check (id = 1),
  is_open boolean not null default true,
  phone text not null,
  whatsapp text not null,
  email text not null,
  address text not null,
  closed_notice text not null,
  updated_at timestamptz not null default now()
);

create table public.staff_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_users(id) on delete set null
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  is_collectible_online boolean not null default true,
  base_price_paise integer not null check (base_price_paise >= 0),
  estimated_turnaround text not null default '',
  display_order integer not null default 0,
  form_schema jsonb not null default '[]'::jsonb,
  pricing_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_requests (
  id uuid primary key default gen_random_uuid(),
  token text unique,
  service_id uuid not null references public.services(id) on delete restrict,
  service_snapshot jsonb not null,
  status text not null check (status in ('DRAFT_AWAITING_ADVANCE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED')),
  customer_phone text,
  customer_email text,
  customer_note text,
  form_data jsonb not null default '{}'::jsonb,
  total_amount_paise integer not null check (total_amount_paise >= 0),
  advance_required_paise integer not null check (advance_required_paise >= 0),
  amount_paid_paise integer not null default 0 check (amount_paid_paise >= 0),
  cancellation_reason text,
  storage_prefix text unique not null,
  submitted_while_closed boolean not null default false,
  terminal_at timestamptz,
  files_expire_at timestamptz,
  files_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_requests_contact_required check (
    nullif(trim(coalesce(customer_phone, '')), '') is not null
    or nullif(trim(coalesce(customer_email, '')), '') is not null
  )
);

create table public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.work_requests(id) on delete cascade,
  direction text not null check (direction in ('input', 'output')),
  field_key text,
  storage_key text unique not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by_staff_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.work_requests(id) on delete cascade,
  payment_type text not null check (payment_type in ('advance', 'balance', 'full')),
  provider text not null,
  provider_ref text not null,
  amount_paise integer not null check (amount_paise > 0),
  status text not null check (status in ('PENDING', 'SUCCESS', 'FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 2. Indexes (query paths + foreign keys)

create index staff_users_created_by_idx
  on public.staff_users (created_by);

create index services_active_order_idx
  on public.services (is_active, display_order);

create index work_requests_status_created_idx
  on public.work_requests (status, created_at desc);

create index work_requests_customer_phone_idx
  on public.work_requests (customer_phone)
  where customer_phone is not null;

create index work_requests_customer_email_idx
  on public.work_requests (customer_email)
  where customer_email is not null;

create index work_requests_created_at_idx
  on public.work_requests (created_at desc);

create index work_requests_files_purge_idx
  on public.work_requests (files_expire_at)
  where files_purged_at is null and files_expire_at is not null;

create index work_requests_service_id_idx
  on public.work_requests (service_id);

create index request_files_request_direction_idx
  on public.request_files (request_id, direction);

create index request_files_uploaded_by_staff_id_idx
  on public.request_files (uploaded_by_staff_id);

create index payments_request_created_idx
  on public.payments (request_id, created_at desc);

-- 3. updated_at trigger function & triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger shop_settings_set_updated_at
  before update on public.shop_settings
  for each row
  execute function public.set_updated_at();

create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

create trigger work_requests_set_updated_at
  before update on public.work_requests
  for each row
  execute function public.set_updated_at();

-- 4. Backend-only lockdown (RLS enabled with zero policies + explicit REVOKE from anon/authenticated)

alter table public.shop_settings enable row level security;
alter table public.staff_users enable row level security;
alter table public.services enable row level security;
alter table public.work_requests enable row level security;
alter table public.request_files enable row level security;
alter table public.payments enable row level security;

revoke all on table public.shop_settings from public, anon, authenticated;
revoke all on table public.staff_users from public, anon, authenticated;
revoke all on table public.services from public, anon, authenticated;
revoke all on table public.work_requests from public, anon, authenticated;
revoke all on table public.request_files from public, anon, authenticated;
revoke all on table public.payments from public, anon, authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;

grant all on table public.shop_settings to service_role;
grant all on table public.staff_users to service_role;
grant all on table public.services to service_role;
grant all on table public.work_requests to service_role;
grant all on table public.request_files to service_role;
grant all on table public.payments to service_role;
