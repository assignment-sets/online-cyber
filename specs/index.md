onlineCyber — Specification Index

onlineCyber is a lightweight, mobile-first web portal built specifically for customers who want to submit cyber café / document & printing jobs asynchronously and remotely, then either download completed digital deliverables online or pick up physical work at the shop later.

Walk-in counter customers and offline cash transactions remain completely separate and outside the scope of this application.

Specification Documents

[01-overview-and-architecture.md](./01-overview-and-architecture.md) — Product philosophy, non-goals, high-level tech stack (Next.js, Vercel, Supabase Postgres, S3-compatible storage), role boundaries, payment gateway abstraction, and 14-day asset retention policy.

[02-functional-flows.md](./02-functional-flows.md) — Customer storefront, dynamic service forms, per-field file validation, backend pricing engine, >= 500 INR advance payment rule, token issuance/lookup, delivery modes, and cancellation policy.

[03-admin-and-owner-terminal.md](./03-admin-and-owner-terminal.md) — Hidden /admin terminal, staff authentication, operational tools (shop status, dynamic service configurator, token queue & recovery, fulfillment, payment history), and Owner-only staff management.
