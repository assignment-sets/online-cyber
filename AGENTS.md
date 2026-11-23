<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Workflow Rules

- **Skills first:** Always read and follow the matching `.agents/skills/` `SKILL.md` before writing code, SQL, UI, or running infra tasks:
  - **UI/UX:** `shadcn` for components; run `web-design-guidelines` on modified UI files before finishing.
  - **Database:** `supabase` + `supabase-postgres-best-practices` for schema, RLS, queries, and migrations.
  - **Infra:** `deploy-to-vercel` / `vercel-cli-with-tokens` / `vercel-optimize` for Vercel; `cf-cli` (`npx cf`) for Cloudflare R2.
- **CLI Utilities:** `npx supabase`, `npx vercel`, and `npx cf` (R2) are available — follow [.agents/rules/cli-utilities.md](./.agents/rules/cli-utilities.md).
- **Verify every code change:** Always run `npm run lint` and `npm run test:run` (single-run Vitest; `npm test` starts watch mode).
- **Skip `npm run build` on small edits:** Run `npm run build` only after large multi-file changes or when explicitly requested.
- **No autonomous Git operations:** **NEVER** stage (`git add`), unstage, commit (`git commit`), push (`git push`), create/switch branches, create worktrees, or perform any other Git/version-control mutation unless explicitly instructed by the user.
