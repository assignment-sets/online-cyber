# Project Rules — Supabase & Database Workflow

## 1. Supabase CLI Availability & Core Capabilities
- **CLI:** `npx supabase` (v3.3.0) is installed and must be used for all Supabase and Postgres interactions.
- **Key Capabilities:**
  - **Projects & Linking:** `projects list|create|api-keys`, `link`, `orgs`
  - **Database & Migrations:** `migration new|list`, `db push|pull|diff|dump|query|advisors|lint`
  - **Codegen:** `gen` (generate TypeScript types from remote schema)
  - **Storage, Functions & Secrets:** `storage ls|cp|mv|rm`, `functions list|deploy|download|delete`, `secrets list|set|unset`
  - **Observability:** `logs`, `inspect`

## 2. Cloud-Only Rule (No Local Containers)
- **NEVER** use local container/Docker-based Supabase commands (`supabase start`, `supabase stop`, `supabase status`, `supabase test`, `supabase db start`, or `--local` flags).
- Always target the linked remote cloud Supabase project.

## 3. Mandatory Migration Flow
- **NEVER** apply ad-hoc or random schema changes directly to the remote database.
- All schema changes must follow this exact flow:
  1. Generate a timestamped migration file locally: `npx supabase migration new <descriptive_name>`
  2. Write the SQL migration inside `supabase/migrations/`.
  3. Push migrations to the cloud database: `npx supabase db push`
  4. Audit and verify: run `npx supabase db advisors` (fix any security/RLS/performance warnings) and confirm state via `npx supabase migration list` or `npx supabase db query`.

## 4. Database Interaction & Hygiene
- Use `npx supabase db query` for read-only inspection or verification queries.
- Keep local `supabase/migrations/` as the single source of truth for schema history; after pushing schema changes, regenerate client types with `npx supabase gen` if applicable.

---

# Project Rules — Vercel CLI & Deployment Workflow

## 1. Vercel CLI Availability & Core Capabilities
- **CLI:** `npx vercel` (v66.6.0) is installed and authenticated; use it for deploying and managing this Next.js app on Vercel.
- **Key Capabilities:**
  - **Deployments & Rollbacks:** `deploy`, `build`, `list`, `inspect [--logs]`, `promote`, `redeploy`, `rollback`, `remove`
  - **Project & Env Config:** `link`, `project`, `env ls|add|rm|pull`, `pull`
  - **Domains, Routing & Security:** `domains`, `dns`, `certs`, `redirects`, `routes`, `firewall` (WAF rules & bypasses), `logs`

## 2. Deployment & Safety Rules
- **Default to Preview:** Always deploy as preview (`npx vercel deploy -y --no-wait`); only pass `--prod` or `git push` when the user explicitly requests production.
- **Safe State Checks & Hygiene:** Check `.vercel/project.json` / `.vercel/repo.json` or `npx vercel whoami` (never run `project inspect` or `link` in an unlinked directory just to check state); never pass tokens via `--token` (rely on `VERCEL_TOKEN` env or existing CLI auth).

---

# Project Rules — Cloudflare CLI (`npx cf`) & R2 Storage

## 1. Cloudflare CLI Availability & Scope
- **CLI:** `npx cf` (`v1.0.0-rc.3`) is installed and authenticated (`mondalgourab140@gmail.com` via OAuth); use it (not `wrangler`, unless a Wrangler config exists) for Cloudflare R2 storage management (buckets, CORS, 14-day lifecycle purge rules, objects).

## 2. Discovery & Safety Rules
- **Discover before running:** Always use `npx cf cli search "<task>"`, `npx cf schema <command>`, or `npx cf <command> --help` instead of guessing flags.
- **Preview mutations:** Pass `--dry-run` when supported before applying destructive or configuration changes.
