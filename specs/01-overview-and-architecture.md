01 — Overview & System Architecture

1. Product Philosophy & Strict Non-Goals

Purpose-Built for Remote Async Jobs: Designed exclusively for customers submitting work remotely to avoid waiting in physical shop queues. Walk-in counter queues and offline counter payments are intentionally excluded from this system.

Zero Customer Friction: No customer accounts, passwords, or OTP logins. A customer visits, picks a service, fills the dynamic form, submits, gets a Work Token, and tracks/collects later.

Offline Human Resolution for Exceptions: No in-app chat, no reopening/editing submitted forms, and no in-app refund workflows. When an asset is blurry/defective or a refund is needed, staff mark the token CANCELED with a reason and contact the customer directly via phone/WhatsApp/email.

Backend as Single Source of Truth: All form field definitions, file constraints, and pricing rules are stored in the database and enforced on the backend. The frontend dynamically renders whatever the backend specifies.

2. High-Level Tech Stack

Web Framework & Hosting: Next.js (App Router) deployed on Vercel (with Vercel CLI access enabled for direct environment and infrastructure management).

Database: Supabase (PostgreSQL) used for storing dynamic service configurations, work requests/tokens, payment records, shop status, and internal staff credentials. (Schema design is left to the implementing engineer.)

Object Storage: S3-compatible Object Storage (e.g., AWS S3, Cloudflare R2, or Supabase Storage) accessed via presigned URLs so large customer uploads and admin deliverables transfer directly without hitting serverless payload size limits.

3. Roles & Access Model (Keep It Simple)

Customer (Unauthenticated): Public access to storefront, service submission, token status lookup, payment checkout, and digital deliverable downloads.

Admin: Full operational control over the shop and platform—can toggle shop open/closed status, add/edit/disable services and pricing rules, process work tokens, upload deliverables, cancel requests, and view payment history.

Owner: Has all Admin capabilities, plus the exclusive ability to create and delete Admin accounts.

4. Payment Gateway Abstraction

Pluggable Checkout Interface: Payment processing must be isolated behind a clean payment provider abstraction so a real payment gateway (e.g., Razorpay / UPI / Stripe) can be integrated later without rewriting order or token flows.

Initial Draft Implementation: Wired to a Mock Payment Provider that simulates one-time checkout and deterministically returns SUCCESS or FAILED.

5. Storage Structure & 14-Day Asset Retention

Single Folder per Request: All customer-uploaded input files and admin-uploaded output files for a single job are grouped under one isolated storage folder/prefix per request.

14-Day Auto-Cleanup: Once a request reaches a terminal state (COMPLETED or CANCELED), all associated input and output files in object storage are automatically purged after 14 days.

Permanent Audit Metadata: Lightweight request metadata (Token, customer contact info, service selected, final status, payment records, timestamps) is retained permanently in the database for history and bookkeeping.
