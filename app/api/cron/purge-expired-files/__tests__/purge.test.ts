import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/database.types";

type WorkRequestRow = Database["public"]["Tables"]["work_requests"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

interface MockDbState {
  work_requests: WorkRequestRow[];
  payments: PaymentRow[];
  failTopLevelQuery: boolean;
  failUpdateIds: Set<string>;
  deleteCalledTables: string[];
}

const mockState = vi.hoisted(() => ({
  db: {
    work_requests: [],
    payments: [],
    failTopLevelQuery: false,
    failUpdateIds: new Set<string>(),
    deleteCalledTables: [],
  } as MockDbState,
  deleteRequestFolder: vi.fn<
    (storagePrefix: string) => Promise<{ deletedCount: number }>
  >(),
  loggerError: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
  loggerInfo: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
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
    deleteRequestFolder: mockState.deleteRequestFolder,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    info: mockState.loggerInfo,
    warn: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    error: mockState.loggerError,
  },
}));

class MockQueryBuilder {
  private readonly table: "work_requests" | "payments";
  private operation: "select" | "update" | "delete" = "select";
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private updatePayload: Record<string, unknown> = {};

  constructor(table: "work_requests" | "payments") {
    this.table = table;
  }

  select(_columns?: string) {
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.operation = "update";
    this.updatePayload = patch;
    return this;
  }

  delete() {
    this.operation = "delete";
    mockState.db.deleteCalledTables.push(this.table);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  lte(column: string, value: string) {
    this.filters.push((row) => {
      const colVal = row[column];
      return typeof colVal === "string" && colVal <= value;
    });
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private async execute(): Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }> {
    if (this.operation === "select") {
      if (mockState.db.failTopLevelQuery) {
        return { data: null, error: { message: "Database connection lost" } };
      }

      let rows = (mockState.db[this.table] as unknown as Record<string, unknown>[])
        .filter((row) => this.filters.every((fn) => fn(row)))
        .map((row) => ({ ...row }));

      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows.sort((a, b) => {
          const av = String(a[column] ?? "");
          const bv = String(b[column] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }

      if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount);
      }

      return { data: rows, error: null };
    }

    if (this.operation === "update") {
      const rows = mockState.db[this.table] as unknown as Record<string, unknown>[];
      const matched = rows.filter((row) => this.filters.every((fn) => fn(row)));

      for (const row of matched) {
        if (mockState.db.failUpdateIds.has(String(row.id))) {
          return { data: null, error: { message: `Update failed for ${String(row.id)}` } };
        }
      }

      for (const row of matched) {
        Object.assign(row, this.updatePayload);
      }

      return { data: matched, error: null };
    }

    return { data: null, error: { message: "Unexpected delete operation" } };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/db/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: "work_requests" | "payments") => new MockQueryBuilder(table),
  }),
}));

import { GET, POST } from "../route";

function makeWorkRequest(overrides: Partial<WorkRequestRow> = {}): WorkRequestRow {
  return {
    id: "req-1",
    token: "OC-20261101-1001",
    service_id: "svc-1",
    service_snapshot: {
      id: "svc-1",
      slug: "pan-card",
      name: "PAN Card Update",
      base_price_paise: 15000,
    },
    customer_phone: "9876543210",
    customer_email: "customer@example.com",
    customer_note: "Urgent",
    form_data: { fullName: "Asha Devi" },
    status: "COMPLETED",
    submitted_while_closed: false,
    total_amount_paise: 15000,
    advance_required_paise: 5000,
    amount_paid_paise: 15000,
    cancellation_reason: null,
    storage_prefix: "requests/req-1",
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-02T10:00:00.000Z",
    terminal_at: "2026-11-02T10:00:00.000Z",
    files_expire_at: "2026-11-16T10:00:00.000Z",
    files_purged_at: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "pay-1",
    request_id: "req-1",
    payment_type: "ADVANCE",
    provider: "mock",
    provider_ref: "mock_ref_1",
    amount_paise: 5000,
    status: "SUCCESS",
    metadata: {},
    created_at: "2026-11-01T10:01:00.000Z",
    completed_at: "2026-11-01T10:01:05.000Z",
    ...overrides,
  };
}

function buildCronRequest(
  method: "GET" | "POST" = "GET",
  authorization?: string
): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set("authorization", authorization);
  }
  return new NextRequest("http://localhost:3000/api/cron/purge-expired-files", {
    method,
    headers,
  });
}

describe("Cron /api/cron/purge-expired-files", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-value-12345";
    mockState.db = {
      work_requests: [],
      payments: [],
      failTopLevelQuery: false,
      failUpdateIds: new Set<string>(),
      deleteCalledTables: [],
    };
    mockState.deleteRequestFolder.mockResolvedValue({ deletedCount: 3 });
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  describe("Authorization", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const response = await GET(buildCronRequest("GET"));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized." });
      expect(mockState.deleteRequestFolder).not.toHaveBeenCalled();
    });

    it("returns 401 when Authorization header has wrong secret or format", async () => {
      const wrongSecretRes = await GET(
        buildCronRequest("GET", "Bearer wrong-cron-secret-value-99")
      );
      expect(wrongSecretRes.status).toBe(401);

      const differentLengthRes = await GET(
        buildCronRequest("GET", "Bearer short")
      );
      expect(differentLengthRes.status).toBe(401);

      const wrongSchemeRes = await GET(
        buildCronRequest("GET", "Basic test-cron-secret-value-12345")
      );
      expect(wrongSchemeRes.status).toBe(401);

      expect(mockState.deleteRequestFolder).not.toHaveBeenCalled();
    });

    it("returns 401 when CRON_SECRET is not configured", async () => {
      delete process.env.CRON_SECRET;

      const response = await GET(
        buildCronRequest("GET", "Bearer test-cron-secret-value-12345")
      );

      expect(response.status).toBe(401);
      expect(mockState.deleteRequestFolder).not.toHaveBeenCalled();
    });
  });

  describe("Expired asset retention cleanup", () => {
    it("purges expired INITIATED, DRAFT_AWAITING_ADVANCE, CANCELED (24h), and COMPLETED (14d) requests while never touching PENDING or IN_PROGRESS", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-27T12:00:00.000Z"));

      const expiredInitiated = makeWorkRequest({
        id: "req-expired-initiated",
        token: null,
        status: "INITIATED",
        storage_prefix: "requests/req-expired-initiated",
        created_at: "2026-11-26T10:00:00.000Z",
        terminal_at: null,
        files_expire_at: "2026-11-27T10:00:00.000Z",
        files_purged_at: null,
      });

      const expiredDraft = makeWorkRequest({
        id: "req-expired-draft",
        token: "OC-20261126-1000",
        status: "DRAFT_AWAITING_ADVANCE",
        storage_prefix: "requests/req-expired-draft",
        created_at: "2026-11-26T11:00:00.000Z",
        terminal_at: null,
        files_expire_at: "2026-11-27T11:00:00.000Z",
        files_purged_at: null,
      });

      const expiredCanceled = makeWorkRequest({
        id: "req-expired-canceled",
        token: "OC-20261126-1002",
        status: "CANCELED",
        cancellation_reason: "Blurry document",
        storage_prefix: "requests/req-expired-canceled",
        terminal_at: "2026-11-26T11:30:00.000Z",
        files_expire_at: "2026-11-27T11:30:00.000Z",
        files_purged_at: null,
      });

      const expiredCompleted = makeWorkRequest({
        id: "req-expired-completed",
        token: "OC-20261101-1001",
        status: "COMPLETED",
        storage_prefix: "requests/req-expired-completed",
        terminal_at: "2026-11-12T00:00:00.000Z",
        files_expire_at: "2026-11-26T00:00:00.000Z",
        files_purged_at: null,
      });

      const alreadyPurged = makeWorkRequest({
        id: "req-already-purged",
        token: "OC-20261101-1003",
        status: "COMPLETED",
        storage_prefix: "requests/req-already-purged",
        files_expire_at: "2026-11-10T00:00:00.000Z",
        files_purged_at: "2026-11-11T02:00:00.000Z",
      });

      const futureCompletedExpiry = makeWorkRequest({
        id: "req-future-completed",
        token: "OC-20261125-1004",
        status: "COMPLETED",
        storage_prefix: "requests/req-future-completed",
        terminal_at: "2026-11-20T12:00:00.000Z",
        files_expire_at: "2026-12-04T12:00:00.000Z",
        files_purged_at: null,
      });

      const futureInitiatedExpiry = makeWorkRequest({
        id: "req-future-initiated",
        token: null,
        status: "INITIATED",
        storage_prefix: "requests/req-future-initiated",
        files_expire_at: "2026-11-28T11:00:00.000Z",
        files_purged_at: null,
      });

      const activePending = makeWorkRequest({
        id: "req-pending",
        token: "OC-20261101-1006",
        status: "PENDING",
        storage_prefix: "requests/req-pending",
        files_expire_at: "2026-11-10T00:00:00.000Z",
        files_purged_at: null,
      });

      const activeInProgress = makeWorkRequest({
        id: "req-in-progress",
        token: "OC-20261101-1005",
        status: "IN_PROGRESS",
        storage_prefix: "requests/req-in-progress",
        files_expire_at: "2026-11-10T00:00:00.000Z",
        files_purged_at: null,
      });

      const paymentRecord = makePayment({
        id: "pay-keep-1",
        request_id: "req-expired-completed",
        amount_paise: 15000,
      });

      mockState.db.work_requests = [
        expiredCompleted,
        expiredInitiated,
        expiredDraft,
        expiredCanceled,
        alreadyPurged,
        futureCompletedExpiry,
        futureInitiatedExpiry,
        activePending,
        activeInProgress,
      ];
      mockState.db.payments = [paymentRecord];

      mockState.deleteRequestFolder
        .mockResolvedValueOnce({ deletedCount: 4 })
        .mockResolvedValueOnce({ deletedCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 2 })
        .mockResolvedValueOnce({ deletedCount: 3 });

      const response = await GET(
        buildCronRequest("GET", "Bearer test-cron-secret-value-12345")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        processedCount: 4,
        purgedCount: 4,
        deletedObjectsTotal: 10,
        failedIds: [],
      });

      expect(mockState.deleteRequestFolder).toHaveBeenCalledTimes(4);
      expect(mockState.deleteRequestFolder).toHaveBeenNthCalledWith(
        1,
        "requests/req-expired-completed"
      );
      expect(mockState.deleteRequestFolder).toHaveBeenNthCalledWith(
        2,
        "requests/req-expired-initiated"
      );
      expect(mockState.deleteRequestFolder).toHaveBeenNthCalledWith(
        3,
        "requests/req-expired-draft"
      );
      expect(mockState.deleteRequestFolder).toHaveBeenNthCalledWith(
        4,
        "requests/req-expired-canceled"
      );

      // Audit metadata and payment records must be preserved (no SQL deletes)
      expect(mockState.db.deleteCalledTables).toEqual([]);
      expect(mockState.db.work_requests).toHaveLength(9);
      expect(mockState.db.payments).toHaveLength(1);

      const updatedCompleted = mockState.db.work_requests.find(
        (r) => r.id === "req-expired-completed"
      );
      expect(updatedCompleted?.files_purged_at).not.toBeNull();
      expect(updatedCompleted?.token).toBe("OC-20261101-1001");
      expect(updatedCompleted?.customer_phone).toBe("9876543210");
      expect(updatedCompleted?.amount_paid_paise).toBe(15000);

      for (const purgedId of [
        "req-expired-initiated",
        "req-expired-draft",
        "req-expired-canceled",
      ]) {
        expect(
          mockState.db.work_requests.find((r) => r.id === purgedId)
            ?.files_purged_at
        ).not.toBeNull();
      }

      const updatedCanceled = mockState.db.work_requests.find(
        (r) => r.id === "req-expired-canceled"
      );
      expect(updatedCanceled?.cancellation_reason).toBe("Blurry document");

      // Non-eligible and active rows remain untouched
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-future-completed")
          ?.files_purged_at
      ).toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-future-initiated")
          ?.files_purged_at
      ).toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-pending")
          ?.files_purged_at
      ).toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-in-progress")
          ?.files_purged_at
      ).toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-already-purged")
          ?.files_purged_at
      ).toBe("2026-11-11T02:00:00.000Z");

      vi.useRealTimers();
    });

    it("supports POST requests using the same handler", async () => {
      mockState.db.work_requests = [
        makeWorkRequest({
          id: "req-post-1",
          storage_prefix: "requests/req-post-1",
          files_expire_at: "2026-11-10T00:00:00.000Z",
          files_purged_at: null,
        }),
      ];
      mockState.deleteRequestFolder.mockResolvedValueOnce({ deletedCount: 1 });

      const response = await POST(
        buildCronRequest("POST", "Bearer test-cron-secret-value-12345")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        processedCount: 1,
        purgedCount: 1,
        deletedObjectsTotal: 1,
        failedIds: [],
      });
    });

    it("handles partial failure on one request without blocking remaining batch", async () => {
      const req1 = makeWorkRequest({
        id: "req-fail-r2",
        token: "OC-20261101-2001",
        storage_prefix: "requests/req-fail-r2",
        files_expire_at: "2026-11-08T00:00:00.000Z",
        files_purged_at: null,
      });
      const req2 = makeWorkRequest({
        id: "req-ok",
        token: "OC-20261101-2002",
        storage_prefix: "requests/req-ok",
        files_expire_at: "2026-11-09T00:00:00.000Z",
        files_purged_at: null,
      });
      const req3 = makeWorkRequest({
        id: "req-fail-db",
        token: "OC-20261101-2003",
        storage_prefix: "requests/req-fail-db",
        files_expire_at: "2026-11-10T00:00:00.000Z",
        files_purged_at: null,
      });

      mockState.db.work_requests = [req1, req2, req3];
      mockState.db.failUpdateIds.add("req-fail-db");

      mockState.deleteRequestFolder
        .mockRejectedValueOnce(new Error("R2 timeout"))
        .mockResolvedValueOnce({ deletedCount: 5 })
        .mockResolvedValueOnce({ deletedCount: 2 });

      const response = await GET(
        buildCronRequest("GET", "Bearer test-cron-secret-value-12345")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        processedCount: 3,
        purgedCount: 1,
        deletedObjectsTotal: 5,
        failedIds: ["req-fail-r2", "req-fail-db"],
      });

      expect(mockState.deleteRequestFolder).toHaveBeenCalledTimes(3);
      expect(mockState.loggerError).toHaveBeenCalledTimes(2);

      expect(
        mockState.db.work_requests.find((r) => r.id === "req-fail-r2")
          ?.files_purged_at
      ).toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-ok")
          ?.files_purged_at
      ).not.toBeNull();
      expect(
        mockState.db.work_requests.find((r) => r.id === "req-fail-db")
          ?.files_purged_at
      ).toBeNull();
    });

    it("returns 500 when the top-level work_requests query fails", async () => {
      mockState.db.failTopLevelQuery = true;

      const response = await GET(
        buildCronRequest("GET", "Bearer test-cron-secret-value-12345")
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "Failed to query expired work requests." });
      expect(mockState.loggerError).toHaveBeenCalled();
    });
  });
});
