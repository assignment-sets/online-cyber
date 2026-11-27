import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/database.types";
import { WORK_TOKEN_REGEX } from "@/lib/domain/tokens";

type ShopSettingsRow = Database["public"]["Tables"]["shop_settings"]["Row"];
type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
type WorkRequestRow = Database["public"]["Tables"]["work_requests"]["Row"];
type RequestFileRow = Database["public"]["Tables"]["request_files"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

interface InMemoryDb {
  shop_settings: ShopSettingsRow[];
  services: ServiceRow[];
  work_requests: WorkRequestRow[];
  request_files: RequestFileRow[];
  payments: PaymentRow[];
  forceNextTokenCollision: boolean;
}

const mockState = vi.hoisted(() => ({
  db: {
    shop_settings: [],
    services: [],
    work_requests: [],
    request_files: [],
    payments: [],
    forceNextTokenCollision: false,
  } as InMemoryDb,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    createPresignedUploadUrl: vi.fn<
      (params: { storageKey: string }) => Promise<string>
    >(
      async ({ storageKey }) =>
        `https://r2.mock.local/upload/${encodeURIComponent(storageKey)}?sig=put`
    ),
    createPresignedDownloadUrl: vi.fn<
      (params: {
        storageKey: string;
        downloadFilename?: string;
      }) => Promise<string>
    >(
      async ({ storageKey, downloadFilename }) =>
        `https://r2.mock.local/download/${encodeURIComponent(storageKey)}?filename=${encodeURIComponent(downloadFilename ?? "file")}&sig=get`
    ),
  };
});

type TableName =
  | "shop_settings"
  | "services"
  | "work_requests"
  | "request_files"
  | "payments";

class MockQueryBuilder {
  private readonly table: TableName;
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderBys: Array<{ column: string; ascending: boolean }> = [];
  private insertPayload: Record<string, unknown>[] = [];
  private updatePayload: Record<string, unknown> = {};
  private returnSingle: "single" | "maybeSingle" | null = null;

  constructor(table: TableName) {
    this.table = table;
  }

  select(_columns?: string) {
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.insertPayload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.operation = "update";
    this.updatePayload = patch;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBys.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  single() {
    this.returnSingle = "single";
    return this.execute();
  }

  maybeSingle() {
    this.returnSingle = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    data: unknown;
    error: { code?: string; message: string; details?: string } | null;
  }> {
    const store = mockState.db[this.table] as unknown as Record<
      string,
      unknown
    >[];

    if (this.operation === "insert") {
      const inserted: Record<string, unknown>[] = [];
      for (const item of this.insertPayload) {
        if (this.table === "work_requests") {
          if (
            item.token &&
            mockState.db.forceNextTokenCollision
          ) {
            mockState.db.forceNextTokenCollision = false;
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "work_requests_token_key"',
              },
            };
          }

          if (store.some((existing) => existing.id === item.id)) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "work_requests_pkey"',
              },
            };
          }

          if (
            item.token &&
            store.some((existing) => existing.token === item.token)
          ) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "work_requests_token_key"',
              },
            };
          }
        }

        const now = new Date().toISOString();
        const row: Record<string, unknown> = {
          id: item.id ?? crypto.randomUUID(),
          created_at: item.created_at ?? now,
          updated_at: item.updated_at ?? now,
          ...item,
        };

        if (this.table === "work_requests") {
          row.cancellation_reason ??= null;
          row.terminal_at ??= null;
          row.files_expire_at ??= null;
          row.files_purged_at ??= null;
        }

        store.push(row);
        inserted.push(row);
      }

      if (this.returnSingle) {
        return { data: inserted[0] ?? null, error: null };
      }
      return { data: inserted, error: null };
    }

    if (this.operation === "update") {
      const updated: Record<string, unknown>[] = [];
      for (const row of store) {
        if (this.filters.every((fn) => fn(row))) {
          if (
            this.table === "work_requests" &&
            this.updatePayload.token &&
            mockState.db.forceNextTokenCollision
          ) {
            mockState.db.forceNextTokenCollision = false;
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "work_requests_token_key"',
              },
            };
          }

          Object.assign(row, this.updatePayload, {
            updated_at: new Date().toISOString(),
          });
          updated.push(row);
        }
      }

      if (this.returnSingle) {
        return { data: updated[0] ?? null, error: null };
      }
      return { data: updated, error: null };
    }

    if (this.operation === "delete") {
      const kept: Record<string, unknown>[] = [];
      const removed: Record<string, unknown>[] = [];
      for (const row of store) {
        if (this.filters.every((fn) => fn(row))) {
          removed.push(row);
        } else {
          kept.push(row);
        }
      }
      (mockState.db[this.table] as unknown as Record<string, unknown>[]) = kept;
      return { data: removed, error: null };
    }

    // select
    let rows = store.filter((row) => this.filters.every((fn) => fn(row)));

    if (this.orderBys.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orderBys) {
          const av = a[column];
          const bv = b[column];
          if (av === bv) continue;
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av ?? "").localeCompare(String(bv ?? ""));
          return ascending ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (this.returnSingle === "single") {
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: `Expected 1 row, found ${rows.length}`,
          },
        };
      }
      return { data: rows[0], error: null };
    }

    if (this.returnSingle === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }

    return { data: rows, error: null };
  }
}

vi.mock("@/lib/db/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: TableName) => new MockQueryBuilder(table),
  }),
}));

import { GET as getShop } from "@/app/api/shop/route";
import { GET as getServices } from "@/app/api/services/route";
import { GET as getServiceBySlug } from "@/app/api/services/[slug]/route";
import { POST as postRequest } from "@/app/api/requests/route";
import { POST as postFinalize } from "@/app/api/requests/[id]/finalize/route";
import { POST as postCheckout } from "@/app/api/payments/checkout/route";
import { GET as getTokenStatus } from "@/app/api/tokens/[token]/route";
import { createPresignedUploadUrl } from "@/lib/storage/r2";

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedDefaultDb(): void {
  mockState.db = {
    forceNextTokenCollision: false,
    shop_settings: [
      {
        id: 1,
        is_open: true,
        phone: "+91 98765 43210",
        whatsapp: "919876543210",
        email: "support@onlinecyber.example",
        address: "12 MG Road, Tech Plaza",
        closed_notice:
          "Shop is currently closed. Estimated turnaround applies with no delivery time guarantee.",
        updated_at: "2026-11-26T10:00:00.000Z",
      },
    ],
    services: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "jee-form-fillup",
        name: "JEE Exam Form Fill-up",
        description: "Online application assistance and confirmation PDF",
        is_active: true,
        is_collectible_online: true,
        base_price_paise: 15000, // ₹150
        estimated_turnaround: "24 hours",
        display_order: 2,
        form_schema: [
          {
            key: "candidate_name",
            label: "Candidate Name",
            type: "text",
            required: true,
            min: 2,
          },
          {
            key: "urgent_processing",
            label: "Urgent Processing",
            type: "checkbox",
            required: false,
          },
          {
            key: "aadhaar_doc",
            label: "Aadhaar Card",
            type: "file",
            required: true,
            allowedMimeTypes: ["application/pdf", "image/jpeg"],
            maxFileSizeBytes: 5 * 1024 * 1024,
            maxFiles: 1,
          },
        ],
        pricing_rules: [
          {
            id: "urgent_fee",
            label: "Urgent Processing Surcharge",
            type: "boolean_surcharge",
            fieldKey: "urgent_processing",
            surchargePaise: 40000, // +₹400 -> ₹550 total (>= ₹500 threshold)
          },
        ],
        created_at: "2026-11-26T09:00:00.000Z",
        updated_at: "2026-11-26T09:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "bulk-xerox-print",
        name: "Bulk Xerox & Printout",
        description: "Physical pickup printouts and spiral binding",
        is_active: true,
        is_collectible_online: false,
        base_price_paise: 2000, // ₹20
        estimated_turnaround: "4 hours",
        display_order: 1,
        form_schema: [
          {
            key: "page_count",
            label: "Total Pages",
            type: "number",
            required: true,
            min: 1,
            max: 1000,
          },
          {
            key: "print_files",
            label: "Files to Print",
            type: "file",
            required: true,
            allowedMimeTypes: ["application/pdf"],
            maxFileSizeBytes: 10 * 1024 * 1024,
            maxFiles: 5,
          },
        ],
        pricing_rules: [
          {
            id: "per_page",
            label: "Per Page Print Charge",
            type: "per_unit",
            fieldKey: "page_count",
            unitPricePaise: 300, // ₹3/page
          },
        ],
        created_at: "2026-11-26T09:00:00.000Z",
        updated_at: "2026-11-26T09:00:00.000Z",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "archived-service",
        name: "Archived Service",
        description: "Disabled service",
        is_active: false,
        is_collectible_online: true,
        base_price_paise: 10000,
        estimated_turnaround: "N/A",
        display_order: 99,
        form_schema: [],
        pricing_rules: [],
        created_at: "2026-11-26T09:00:00.000Z",
        updated_at: "2026-11-26T09:00:00.000Z",
      },
    ],
    work_requests: [],
    request_files: [],
    payments: [],
  };
}

beforeEach(() => {
  seedDefaultDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Public storefront API routes", () => {
  it("GET /api/shop returns public shop settings", async () => {
    const res = await getShop();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shop).toEqual({
      isOpen: true,
      phone: "+91 98765 43210",
      whatsapp: "919876543210",
      email: "support@onlinecyber.example",
      address: "12 MG Road, Tech Plaza",
      closedNotice:
        "Shop is currently closed. Estimated turnaround applies with no delivery time guarantee.",
      updatedAt: "2026-11-26T10:00:00.000Z",
    });
  });

  it("GET /api/services lists active services in displayOrder and excludes inactive services", async () => {
    const res = await getServices();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.services).toHaveLength(2);
    expect(json.services.map((s: { slug: string }) => s.slug)).toEqual([
      "bulk-xerox-print",
      "jee-form-fillup",
    ]);
    expect(json.services[1].formSchema).toHaveLength(3);
    expect(json.services[1].pricingRules).toHaveLength(1);
  });

  it("GET /api/services/[slug] returns 200 for active service and 404 for inactive or missing", async () => {
    const foundRes = await getServiceBySlug(
      new NextRequest("http://localhost/api/services/jee-form-fillup"),
      { params: Promise.resolve({ slug: "jee-form-fillup" }) }
    );
    expect(foundRes.status).toBe(200);
    const foundJson = await foundRes.json();
    expect(foundJson.service.slug).toBe("jee-form-fillup");

    const inactiveRes = await getServiceBySlug(
      new NextRequest("http://localhost/api/services/archived-service"),
      { params: Promise.resolve({ slug: "archived-service" }) }
    );
    expect(inactiveRes.status).toBe(404);

    const missingRes = await getServiceBySlug(
      new NextRequest("http://localhost/api/services/does-not-exist"),
      { params: Promise.resolve({ slug: "does-not-exist" }) }
    );
    expect(missingRes.status).toBe(404);
  });
});

describe("POST /api/requests (Upload-on-Submit initiation & no-files fast path)", () => {
  it("returns 400 with fieldErrors on invalid payload without generating R2 URLs or DB rows", async () => {
    const missingFieldsRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        formData: {
          unknown_field: "hack",
        },
        files: [],
      })
    );
    expect(missingFieldsRes.status).toBe(400);
    const missingJson = await missingFieldsRes.json();
    expect(missingJson.error).toBe("Validation failed");
    expect(missingJson.fieldErrors.customerPhone).toBeDefined();
    expect(missingJson.fieldErrors.customerEmail).toBeDefined();
    expect(missingJson.fieldErrors.candidate_name).toBeDefined();
    expect(missingJson.fieldErrors.aadhaar_doc).toBeDefined();
    expect(missingJson.fieldErrors.unknown_field).toBeDefined();
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
    expect(mockState.db.work_requests).toHaveLength(0);

    const invalidFileRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerPhone: "+91 9876543210",
        formData: { candidate_name: "Asha Roy" },
        files: [
          {
            clientFileId: "cf-bad",
            fieldKey: "aadhaar_doc",
            originalFilename: "malware.exe",
            mimeType: "application/x-msdownload",
            sizeBytes: 2048,
          },
        ],
      })
    );
    expect(invalidFileRes.status).toBe(400);
    const invalidFileJson = await invalidFileRes.json();
    expect(invalidFileJson.fieldErrors.aadhaar_doc).toBeDefined();
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
    expect(mockState.db.work_requests).toHaveLength(0);
  });

  it("creates INITIATED request with batch presigned uploadTargets and 24h expiry when files are provided", async () => {
    mockState.db.shop_settings[0].is_open = false;

    const res = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerEmail: "ASHA@EXAMPLE.COM",
        customerNote: "Please double-check DOB",
        formData: {
          candidate_name: "Asha Roy",
          urgent_processing: true, // 15000 + 40000 = 55000 paise (>= ₹500)
        },
        files: [
          {
            clientFileId: "cf-aadhaar",
            fieldKey: "aadhaar_doc",
            originalFilename: "Aadhaar Front.pdf",
            mimeType: "Application/PDF",
            sizeBytes: 50000,
          },
        ],
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("INITIATED");
    expect(json.requiresAdvance).toBe(true);
    expect(json.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(json.token).toBeNull();
    expect(json.totalAmountPaise).toBe(55000);
    expect(json.advanceRequiredPaise).toBe(27500);
    expect(json.amountPaidPaise).toBe(0);
    expect(json.submittedWhileClosed).toBe(true);
    expect(json.uploadTargets).toHaveLength(1);
    expect(json.uploadTargets[0]).toMatchObject({
      clientFileId: "cf-aadhaar",
      fieldKey: "aadhaar_doc",
      originalFilename: "Aadhaar Front.pdf",
      mimeType: "application/pdf",
      sizeBytes: 50000,
    });
    expect(json.uploadTargets[0].storageKey).toMatch(
      new RegExp(
        `^requests/${json.requestId}/inputs/aadhaar_doc/.+-Aadhaar-Front\\.pdf$`
      )
    );
    expect(json.uploadTargets[0].uploadUrl).toContain(
      "https://r2.mock.local/upload/"
    );
    expect(createPresignedUploadUrl).toHaveBeenCalledTimes(1);

    expect(mockState.db.work_requests).toHaveLength(1);
    expect(mockState.db.work_requests[0].status).toBe("INITIATED");
    expect(mockState.db.work_requests[0].token).toBeNull();
    expect(mockState.db.work_requests[0].customer_email).toBe(
      "asha@example.com"
    );
    expect(mockState.db.work_requests[0].files_expire_at).not.toBeNull();
    expect(
      (
        mockState.db.work_requests[0].service_snapshot as {
          expectedUploads?: unknown[];
        }
      ).expectedUploads
    ).toHaveLength(1);
    expect(mockState.db.request_files).toHaveLength(0);
  });

  it("takes the fast path (PENDING or DRAFT_AWAITING_ADVANCE with uploadTargets: []) when no files are required", async () => {
    mockState.db.services.push({
      id: "44444444-4444-4444-8444-444444444444",
      slug: "pan-status-check",
      name: "PAN Status Check",
      description: "Check PAN status without document upload",
      is_active: true,
      is_collectible_online: true,
      base_price_paise: 10000, // ₹100
      estimated_turnaround: "2 hours",
      display_order: 3,
      form_schema: [
        {
          key: "applicant_name",
          label: "Applicant Name",
          type: "text",
          required: true,
        },
        {
          key: "express_lookup",
          label: "Express Lookup",
          type: "checkbox",
          required: false,
        },
      ],
      pricing_rules: [
        {
          id: "express_fee",
          label: "Express Fee",
          type: "boolean_surcharge",
          fieldKey: "express_lookup",
          surchargePaise: 45000, // +₹450 -> ₹550 total
        },
      ],
      created_at: "2026-11-26T09:00:00.000Z",
      updated_at: "2026-11-26T09:00:00.000Z",
    });

    // < ₹500 -> immediate PENDING, token issued, files_expire_at = null
    mockState.db.forceNextTokenCollision = true;
    const smallRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "pan-status-check",
        customerPhone: "+91 9876543210",
        formData: {
          applicant_name: "Kiran Rao",
          express_lookup: false,
        },
        files: [],
      })
    );
    expect(smallRes.status).toBe(201);
    const smallJson = await smallRes.json();
    expect(smallJson.status).toBe("PENDING");
    expect(smallJson.requiresAdvance).toBe(false);
    expect(smallJson.token).toMatch(WORK_TOKEN_REGEX);
    expect(smallJson.uploadTargets).toEqual([]);
    expect(smallJson.totalAmountPaise).toBe(10000);
    expect(smallJson.advanceRequiredPaise).toBe(0);
    expect(mockState.db.work_requests[0].files_expire_at).toBeNull();

    // >= ₹500 -> immediate DRAFT_AWAITING_ADVANCE, token = null, files_expire_at set
    const largeRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "pan-status-check",
        customerPhone: "+91 9876543210",
        formData: {
          applicant_name: "Kiran Rao",
          express_lookup: true,
        },
        files: [],
      })
    );
    expect(largeRes.status).toBe(201);
    const largeJson = await largeRes.json();
    expect(largeJson.status).toBe("DRAFT_AWAITING_ADVANCE");
    expect(largeJson.requiresAdvance).toBe(true);
    expect(largeJson.token).toBeNull();
    expect(largeJson.uploadTargets).toEqual([]);
    expect(largeJson.totalAmountPaise).toBe(55000);
    expect(largeJson.advanceRequiredPaise).toBe(27500);
    expect(mockState.db.work_requests[1].files_expire_at).not.toBeNull();
  });
});

describe("POST /api/requests/[id]/finalize", () => {
  it("rejects invalid UUID, missing request, non-matching manifest, or purged/non-INITIATED requests", async () => {
    const badIdRes = await postFinalize(
      makeJsonRequest("http://localhost/api/requests/not-a-uuid/finalize", {
        uploadedStorageKeys: ["requests/x/inputs/aadhaar_doc/a.pdf"],
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(badIdRes.status).toBe(400);

    const missingRes = await postFinalize(
      makeJsonRequest(
        "http://localhost/api/requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/finalize",
        {
          uploadedStorageKeys: ["requests/x/inputs/aadhaar_doc/a.pdf"],
        }
      ),
      {
        params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      }
    );
    expect(missingRes.status).toBe(404);

    // Initiate a < ₹500 request with 1 file
    const initRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerPhone: "+91 9876543210",
        formData: {
          candidate_name: "Asha Roy",
          urgent_processing: false,
        },
        files: [
          {
            clientFileId: "cf-1",
            fieldKey: "aadhaar_doc",
            originalFilename: "aadhaar.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12000,
          },
        ],
      })
    );
    expect(initRes.status).toBe(201);
    const initJson = await initRes.json();
    const requestId: string = initJson.requestId;
    const expectedKey: string = initJson.uploadTargets[0].storageKey;

    // Manifest mismatch: wrong key
    const mismatchRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [`requests/${requestId}/inputs/aadhaar_doc/wrong.pdf`],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(mismatchRes.status).toBe(400);
    const mismatchJson = await mismatchRes.json();
    expect(mismatchJson.error).toBe(
      "Uploaded files do not match expected upload manifest."
    );

    // Manifest mismatch: duplicate key
    const dupRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [expectedKey, expectedKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(dupRes.status).toBe(400);
    expect(mockState.db.request_files).toHaveLength(0);
    expect(mockState.db.work_requests[0].status).toBe("INITIATED");

    // Purged INITIATED request cannot be finalized
    mockState.db.work_requests[0].files_purged_at = "2026-11-28T00:00:00.000Z";
    const purgedRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [expectedKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(purgedRes.status).toBe(400);
  });

  it("finalizes < ₹500 INITIATED request into PENDING with token and clears files_expire_at = null", async () => {
    const initRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerEmail: "asha@example.com",
        formData: {
          candidate_name: "Asha Roy",
          urgent_processing: false, // ₹150 < ₹500
        },
        files: [
          {
            clientFileId: "cf-1",
            fieldKey: "aadhaar_doc",
            originalFilename: "aadhaar.pdf",
            mimeType: "application/pdf",
            sizeBytes: 50000,
          },
        ],
      })
    );
    expect(initRes.status).toBe(201);
    const initJson = await initRes.json();
    const requestId: string = initJson.requestId;
    const storageKey: string = initJson.uploadTargets[0].storageKey;

    mockState.db.forceNextTokenCollision = true;
    const finalizeRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [storageKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(finalizeRes.status).toBe(200);
    const finalizeJson = await finalizeRes.json();
    expect(finalizeJson.status).toBe("PENDING");
    expect(finalizeJson.requiresAdvance).toBe(false);
    expect(finalizeJson.requestId).toBe(requestId);
    expect(finalizeJson.token).toMatch(WORK_TOKEN_REGEX);
    expect(finalizeJson.totalAmountPaise).toBe(15000);
    expect(finalizeJson.advanceRequiredPaise).toBe(0);
    expect(finalizeJson.amountPaidPaise).toBe(0);

    expect(mockState.db.request_files).toHaveLength(1);
    expect(mockState.db.request_files[0].direction).toBe("input");
    expect(mockState.db.request_files[0].storage_key).toBe(storageKey);
    expect(mockState.db.work_requests[0].status).toBe("PENDING");
    expect(mockState.db.work_requests[0].files_expire_at).toBeNull();

    // Second finalize attempt must fail with 400
    const repeatRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [storageKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(repeatRes.status).toBe(400);
  });

  it("finalizes >= ₹500 INITIATED request into DRAFT_AWAITING_ADVANCE with token: null and 24h expiry", async () => {
    const initRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerPhone: "+91 9988776655",
        formData: {
          candidate_name: "Vikram Sen",
          urgent_processing: true, // ₹550 >= ₹500
        },
        files: [
          {
            clientFileId: "cf-1",
            fieldKey: "aadhaar_doc",
            originalFilename: "aadhaar.pdf",
            mimeType: "application/pdf",
            sizeBytes: 40000,
          },
        ],
      })
    );
    expect(initRes.status).toBe(201);
    const initJson = await initRes.json();
    const requestId: string = initJson.requestId;
    const storageKey: string = initJson.uploadTargets[0].storageKey;

    const finalizeRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [storageKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(finalizeRes.status).toBe(200);
    const finalizeJson = await finalizeRes.json();
    expect(finalizeJson.status).toBe("DRAFT_AWAITING_ADVANCE");
    expect(finalizeJson.requiresAdvance).toBe(true);
    expect(finalizeJson.requestId).toBe(requestId);
    expect(finalizeJson.token).toBeNull();
    expect(finalizeJson.totalAmountPaise).toBe(55000);
    expect(finalizeJson.advanceRequiredPaise).toBe(27500);
    expect(finalizeJson.amountPaidPaise).toBe(0);

    expect(mockState.db.work_requests[0].status).toBe("DRAFT_AWAITING_ADVANCE");
    expect(mockState.db.work_requests[0].files_expire_at).not.toBeNull();
    expect(mockState.db.request_files).toHaveLength(1);
  });
});

describe("POST /api/payments/checkout & GET /api/tokens/[token]", () => {
  it("handles advance FAILED (402, no token), blocks expired/purged advance drafts, and advance SUCCESS (200, issues token, clears files_expire_at = null) while hiding deliverables until COMPLETED + paid", async () => {
    // 1. Initiate and finalize large job (>= ₹500)
    const initRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "jee-form-fillup",
        customerPhone: "+91 9123456789",
        formData: {
          candidate_name: "Neha Gupta",
          urgent_processing: true,
        },
        files: [
          {
            clientFileId: "cf-1",
            fieldKey: "aadhaar_doc",
            originalFilename: "doc.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12000,
          },
        ],
      })
    );
    expect(initRes.status).toBe(201);
    const initJson = await initRes.json();
    const requestId: string = initJson.requestId;

    const finalizeRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [initJson.uploadTargets[0].storageKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(finalizeRes.status).toBe(200);
    expect(mockState.db.work_requests[0].files_expire_at).not.toBeNull();

    // 2. Advance payment fails -> 402, no token issued
    const failRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "advance",
        simulatedOutcome: "FAILED",
      })
    );
    expect(failRes.status).toBe(402);
    const failJson = await failRes.json();
    expect(failJson.status).toBe("FAILED");
    expect(failJson.paymentRef).toMatch(/^mock_pay_/);
    expect(mockState.db.work_requests[0].token).toBeNull();
    expect(mockState.db.work_requests[0].status).toBe("DRAFT_AWAITING_ADVANCE");
    expect(mockState.db.payments).toHaveLength(1);
    expect(mockState.db.payments[0].status).toBe("FAILED");

    // 2b. Purged draft cannot pay advance
    mockState.db.work_requests[0].files_purged_at = "2026-11-28T00:00:00.000Z";
    const purgedPayRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "advance",
        simulatedOutcome: "SUCCESS",
      })
    );
    expect(purgedPayRes.status).toBe(400);
    const purgedPayJson = await purgedPayRes.json();
    expect(purgedPayJson.error).toBe(
      "Upload window expired for this draft. Please submit a fresh request."
    );
    mockState.db.work_requests[0].files_purged_at = null;

    // 3. Advance payment succeeds -> 200, token issued, status becomes PENDING, files_expire_at cleared
    mockState.db.forceNextTokenCollision = true;
    const advSuccessRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "advance",
        simulatedOutcome: "SUCCESS",
      })
    );
    expect(advSuccessRes.status).toBe(200);
    const advSuccessJson = await advSuccessRes.json();
    expect(advSuccessJson.status).toBe("SUCCESS");
    expect(advSuccessJson.token).toMatch(WORK_TOKEN_REGEX);
    expect(advSuccessJson.requestStatus).toBe("PENDING");
    expect(advSuccessJson.totalAmountPaise).toBe(55000);
    expect(advSuccessJson.amountPaidPaise).toBe(27500);
    expect(advSuccessJson.balanceDuePaise).toBe(27500);
    expect(mockState.db.work_requests[0].files_expire_at).toBeNull();

    const token: string = advSuccessJson.token;

    // 4. Cannot pay balance while still PENDING
    const prematureBalanceRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "balance",
      })
    );
    expect(prematureBalanceRes.status).toBe(400);

    // 5. Simulate admin uploading output deliverable and marking COMPLETED
    mockState.db.request_files.push({
      id: "99999999-9999-4999-8999-999999999999",
      request_id: requestId,
      direction: "output",
      field_key: null,
      storage_key: `requests/${requestId}/outputs/out-1-confirmation.pdf`,
      original_filename: "jee-confirmation.pdf",
      mime_type: "application/pdf",
      size_bytes: 85000,
      uploaded_by_staff_id: null,
      created_at: "2026-11-26T12:00:00.000Z",
    });
    mockState.db.work_requests[0].status = "COMPLETED";
    mockState.db.work_requests[0].terminal_at = "2026-11-26T12:00:00.000Z";

    // 6. Token lookup before paying remaining 50% balance -> deliverables MUST be hidden
    const unpaidTokenRes = await getTokenStatus(
      new NextRequest(`http://localhost/api/tokens/${token.toLowerCase()}`),
      { params: Promise.resolve({ token: `  ${token.toLowerCase()}  ` }) }
    );
    expect(unpaidTokenRes.status).toBe(200);
    const unpaidTokenJson = await unpaidTokenRes.json();
    expect(unpaidTokenJson.token).toBe(token);
    expect(unpaidTokenJson.status).toBe("COMPLETED");
    expect(unpaidTokenJson.balanceDuePaise).toBe(27500);
    expect(unpaidTokenJson.deliverables).toEqual([]);
    expect(unpaidTokenJson.customerPhone).toBeUndefined();
    expect(unpaidTokenJson.customerEmail).toBeUndefined();
    expect(unpaidTokenJson.formData).toBeUndefined();

    // 7. Pay remaining balance -> balanceDuePaise becomes 0
    const balanceRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "balance",
        simulatedOutcome: "SUCCESS",
      })
    );
    expect(balanceRes.status).toBe(200);
    const balanceJson = await balanceRes.json();
    expect(balanceJson.status).toBe("SUCCESS");
    expect(balanceJson.amountPaidPaise).toBe(55000);
    expect(balanceJson.balanceDuePaise).toBe(0);

    // 8. Token lookup after full payment -> presigned download URL returned!
    const paidTokenRes = await getTokenStatus(
      new NextRequest(`http://localhost/api/tokens/${token}`),
      { params: Promise.resolve({ token }) }
    );
    expect(paidTokenRes.status).toBe(200);
    const paidTokenJson = await paidTokenRes.json();
    expect(paidTokenJson.balanceDuePaise).toBe(0);
    expect(paidTokenJson.isCollectibleOnline).toBe(true);
    expect(paidTokenJson.deliverables).toHaveLength(1);
    expect(paidTokenJson.deliverables[0]).toMatchObject({
      id: "99999999-9999-4999-8999-999999999999",
      filename: "jee-confirmation.pdf",
      mimeType: "application/pdf",
      sizeBytes: 85000,
    });
    expect(paidTokenJson.deliverables[0].downloadUrl).toContain(
      "https://r2.mock.local/download/"
    );
  });

  it("omits deliverables for physical pickup services (isCollectibleOnline === false) even after COMPLETED & paid", async () => {
    // 2000 + (10 * 300) = 5000 paise (₹50 < ₹500 -> PENDING after finalize)
    const initRes = await postRequest(
      makeJsonRequest("http://localhost/api/requests", {
        serviceSlug: "bulk-xerox-print",
        customerPhone: "+91 9000011111",
        formData: { page_count: 10 },
        files: [
          {
            clientFileId: "cf-print-1",
            fieldKey: "print_files",
            originalFilename: "notes.pdf",
            mimeType: "application/pdf",
            sizeBytes: 250000,
          },
        ],
      })
    );
    expect(initRes.status).toBe(201);
    const initJson = await initRes.json();
    const requestId: string = initJson.requestId;
    expect(initJson.totalAmountPaise).toBe(5000);

    const finalizeRes = await postFinalize(
      makeJsonRequest(
        `http://localhost/api/requests/${requestId}/finalize`,
        {
          uploadedStorageKeys: [initJson.uploadTargets[0].storageKey],
        }
      ),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(finalizeRes.status).toBe(200);
    const finalizeJson = await finalizeRes.json();
    const token: string = finalizeJson.token;

    // Mark COMPLETED and pay full balance
    mockState.db.work_requests[0].status = "COMPLETED";
    mockState.db.request_files.push({
      id: "88888888-8888-4888-8888-888888888888",
      request_id: requestId,
      direction: "output",
      field_key: null,
      storage_key: `requests/${requestId}/outputs/receipt.pdf`,
      original_filename: "receipt.pdf",
      mime_type: "application/pdf",
      size_bytes: 1000,
      uploaded_by_staff_id: null,
      created_at: "2026-11-26T12:30:00.000Z",
    });

    const fullPayRes = await postCheckout(
      makeJsonRequest("http://localhost/api/payments/checkout", {
        requestId,
        paymentType: "full",
        simulatedOutcome: "SUCCESS",
      })
    );
    expect(fullPayRes.status).toBe(200);

    const tokenRes = await getTokenStatus(
      new NextRequest(`http://localhost/api/tokens/${token}`),
      { params: Promise.resolve({ token }) }
    );
    expect(tokenRes.status).toBe(200);
    const tokenJson = await tokenRes.json();
    expect(tokenJson.status).toBe("COMPLETED");
    expect(tokenJson.balanceDuePaise).toBe(0);
    expect(tokenJson.isCollectibleOnline).toBe(false);
    expect(tokenJson.deliverables).toEqual([]);
  });

  it("returns 404 for unknown token and cancellationReason for CANCELED requests", async () => {
    const missingRes = await getTokenStatus(
      new NextRequest("http://localhost/api/tokens/OC-XXXXXX"),
      { params: Promise.resolve({ token: "OC-XXXXXX" }) }
    );
    expect(missingRes.status).toBe(404);

    mockState.db.work_requests.push({
      id: "77777777-7777-4777-8777-777777777777",
      token: "OC-234567",
      service_id: "11111111-1111-4111-8111-111111111111",
      service_snapshot: {
        name: "JEE Exam Form Fill-up",
        isCollectibleOnline: true,
      },
      status: "CANCELED",
      customer_phone: "+91 9999999999",
      customer_email: null,
      customer_note: null,
      form_data: {},
      total_amount_paise: 15000,
      advance_required_paise: 0,
      amount_paid_paise: 0,
      cancellation_reason: "Aadhaar scan is blurry; please resubmit.",
      storage_prefix: "requests/77777777-7777-4777-8777-777777777777",
      submitted_while_closed: false,
      terminal_at: "2026-11-26T13:00:00.000Z",
      files_expire_at: "2026-12-10T13:00:00.000Z",
      files_purged_at: null,
      created_at: "2026-11-26T11:00:00.000Z",
      updated_at: "2026-11-26T13:00:00.000Z",
    });

    const canceledRes = await getTokenStatus(
      new NextRequest("http://localhost/api/tokens/OC-234567"),
      { params: Promise.resolve({ token: "OC-234567" }) }
    );
    expect(canceledRes.status).toBe(200);
    const canceledJson = await canceledRes.json();
    expect(canceledJson.status).toBe("CANCELED");
    expect(canceledJson.cancellationReason).toBe(
      "Aadhaar scan is blurry; please resubmit."
    );
    expect(canceledJson.deliverables).toEqual([]);
  });
});
