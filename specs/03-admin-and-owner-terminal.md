03 — Admin & Owner Terminal (/admin)

1. Access & Staff Authentication

Dedicated Route: Hosted at /admin and intentionally unlinked from the public customer storefront.

Simple Internal Login: Lightweight username + password login verified against an internal staff table in Supabase Postgres, issuing a signed HTTP-only session cookie. No complex external auth provider is needed.

Role Boundary:

Admin: Full access to all operational features below.

Owner: Everything Admin can do + creating and deleting Admin accounts.

2. Core Terminal Capabilities

A. Shop Status & Public Contact Controls (Admin & Owner)

One-click toggle to switch the storefront between OPEN and CLOSED.

Ability to update public owner contact details (phone, WhatsApp, email, address) shown on the site.

B. Dynamic Service & Pricing Configurator (Admin & Owner)

UI to create new services, enable/disable existing services, update descriptions, set base prices, and configure dynamic pricing modifiers (e.g., per-unit multipliers tied to numeric form fields).

Toggle whether each service is Online Collectible (true/false).

Add, edit, or remove required form fields and document upload slots per service, including per-field allowed file types, max file size, and max file count.

C. Work Queue & Lost-Token Recovery (Admin & Owner)

View and filter incoming work requests by status (PENDING, IN_PROGRESS, COMPLETED, CANCELED; incomplete INITIATED and unpaid DRAFT_AWAITING_ADVANCE requests are excluded from the default active queue and accessible via explicit filter—see [04-upload-lifecycle-and-retention.md](./04-upload-lifecycle-and-retention.md)).

Lost-Token Search: Search requests by Token, Customer Phone, Customer Email, or submission date/time window to verify and assist customers who misplaced their token.

Inspect submitted form values, customer notes, payment status, and download customer-uploaded input files.

D. Job Fulfillment & Cancellation (Admin & Owner)

Complete Job:

For Online Collectible services: Upload one or more finished deliverable files to the request's storage folder, then mark the token COMPLETED.

For Physical Pickup services: Mark the token COMPLETED directly once physical work is ready.

Cancel / Reject Job: Mark a request CANCELED and provide a mandatory Cancellation Reason (shown to the customer on token lookup) before reaching out offline.

E. Payment & Token History (Admin & Owner)

View historical log of all tokens, customer contact records, payment statuses (advance paid, balance settled, pending dues), and timestamps.

F. Staff Account Management (Owner Only)

Create new Admin accounts (username + password) and remove existing Admin accounts.
