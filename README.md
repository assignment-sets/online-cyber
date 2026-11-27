# Online Cyber

A lightweight, mobile-first web portal for submitting cyber café, document, and printing jobs remotely. Customers pick a service, submit required details and files without creating an account, receive a Work Token, complete online payment when due, and either download digital deliverables or pick up physical items at the shop.

## Specifications

- [Specification Index](./specs/index.md)
  - [01 — Overview & System Architecture](./specs/01-overview-and-architecture.md)
  - [02 — Functional Requirements & User Flows](./specs/02-functional-flows.md)
  - [03 — Admin & Owner Terminal (`/admin`)](./specs/03-admin-and-owner-terminal.md)
  - [04 — Upload Lifecycle & Tiered Retention](./specs/04-upload-lifecycle-and-retention.md)

## Tech Stack

- **Framework & Hosting:** Next.js 16 (App Router) on Vercel
- **Database:** Supabase (PostgreSQL)
- **Object Storage:** Cloudflare R2 / S3-compatible storage (presigned URLs, tiered retention: 24h for incomplete/unpaid/canceled, 14d for completed)
- **Tooling:** TypeScript, Tailwind CSS, Oxlint, Vitest + React Testing Library + MSW

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values in `.env.local` (see [.env.example](./.env.example)).
3. Run the development server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run Oxlint |
| `npm run lint:fix` | Run Oxlint with auto-fix |
| `npm run typecheck` | Run TypeScript type check (`tsc --noEmit`) |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |

## For AI Agents

Read [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md) before making any changes, along with [.agents/rules/cli-utilities.md](./.agents/rules/cli-utilities.md) for Supabase, Vercel, and Cloudflare CLI workflows.

## License

[MIT](./LICENSE)
