02 — Functional Requirements & User Flows

1. Storefront, Shop Status & Public Contact Info

Instant Shop Status: The landing page immediately displays whether the shop is currently OPEN or CLOSED.

After-Hours Submissions: Customers can still submit service requests when the shop is CLOSED, with a prominent notice stating that only an estimated turnaround time applies and no delivery time guarantee is given.

Always-Visible Owner Contact Info: Public contact details (Phone number, WhatsApp number/link, Email address, shop address) remain visible on the website at all times.

2. Config-Driven Dynamic Services & Forms

Dynamic Form Rendering: Selecting a service fetches its active configuration from the backend and dynamically renders the required text/number/selection inputs and document upload fields (e.g., selecting "JEE Exam Form Fill-up" renders candidate detail inputs alongside upload slots for Aadhaar Card, 10th Marksheet, and 12th Marksheet).

Strict Backend Validation (400 Bad Request): The backend validates all incoming form fields and file metadata against the active service configuration, rejecting missing, malformed, or out-of-bounds submissions with HTTP 400 and clear field-level error messages.

Service Delivery Flag (is_collectible_online): Each service specifies whether completed work can be delivered digitally:

Online Collectible (true): Supports digital file upload by Admin and provides a Download button to the customer upon completion and payment (e.g., exam form confirmation PDF, edited document).

Physical Pickup (false): Physical output only; displays completion status without a download button so the customer knows to visit the shop and collect it (e.g., bulk xerox, printouts, lamination).

3. Per-Field File Upload Constraints

File limits are defined per document field in the service configuration rather than as a single rigid global cap:

Allowed File Types: Restricts MIME types/extensions per field (e.g., PDF-only vs. JPG/PNG images).

Per-File Size Cap: Tailored per field type (e.g., up to 10 MB per PDF, up to 15 MB per image).

Max File Count per Field: Tailored per field (e.g., 1 file for an ID document, up to 50 files for bulk print/xerox jobs).

Direct-to-Storage Upload: Validated uploads transfer directly from the browser to the request's object storage folder via presigned URLs.

4. Customer Submission & Token Issuance

Mandatory Contact Info & Auto-Timestamp: Every submission requires at least one contact method (Phone Number OR Email Address) alongside an automatic server-side timestamp so staff can:

Locate and verify a customer if they lose their token (via Phone/Email + approximate submission time).

Contact the customer directly if submitted documents or details are missing/defective.

Optional Customer Note: Free-text note field for extra instructions or quirks.

Token Generation & Auto-Copy: Upon successful submission (and advance payment if required), the backend issues a unique Work Token. The UI prominently flashes the token and automatically copies it to the user's clipboard with a clear confirmation banner.

5. Backend Pricing Engine & Split-Payment Rules

100% Backend Charge Calculation: The frontend may show an estimated total for user convenience, but all final charges are calculated exclusively on the backend using the service's base price plus dynamic field-based pricing rules (e.g., ₹3 × number of pages).

Standard Jobs (Total Charge < 500 INR):

0 INR required upfront to submit the request.

Customer pays 100% of the charge via checkout after work is marked COMPLETED to unlock delivery/download.

Large Jobs (Total Charge >= 500 INR):

Customer must pay 50% of the total charge in advance via checkout before the submission is finalized and a token is issued.

Remaining 50% balance is paid after work is marked COMPLETED.

6. Token Status Lookup, Delivery & Rejection Policy

Token Lookup: Customers enter their token on the website to check real-time status (PENDING, IN_PROGRESS, COMPLETED, CANCELED).

When COMPLETED:

If any balance is owed, the customer completes one-time checkout.

As soon as payment succeeds:

If is_collectible_online is true: Displays completion message + Download button(s) for the Admin-uploaded files.

If is_collectible_online is false: Displays completion message instructing the customer to collect their physical items at the shop.

When CANCELED (Defective Assets / Rejection):

If customer-submitted files are unusable or incomplete, Admin marks the token CANCELED with a clear Cancellation Reason (displayed on the token lookup screen) and contacts the customer offline to submit a fresh request.
