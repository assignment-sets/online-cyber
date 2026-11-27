import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import {
  ADMIN_SESSION_COOKIE_NAME,
  AuthError,
  signSessionToken,
} from "@/lib/auth/session";

const {
  mockCookies,
  mockConnection,
  mockRevalidatePath,
  mockRevalidateTag,
  mockGetSupabaseAdmin,
  mockCreatePresignedUploadUrl,
  mockCreatePresignedDownloadUrl,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCookies: vi.fn<() => Promise<ReturnType<typeof createCookieStore>>>(),
  mockConnection: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockRevalidatePath: vi.fn<(path: string) => void>(),
  mockRevalidateTag: vi.fn<(tag: string, profile: string) => void>(),
  mockGetSupabaseAdmin: vi.fn<() => unknown>(),
  mockCreatePresignedUploadUrl: vi.fn<
    (params: {
      storageKey: string;
      contentType: string;
      contentLength?: number;
    }) => Promise<string>
  >(),
  mockCreatePresignedDownloadUrl: vi.fn<
    (params: {
      storageKey: string;
      downloadFilename?: string;
    }) => Promise<string>
  >(),
  mockLoggerError: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: mockConnection,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));

vi.mock("@/lib/db/supabase-admin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    createPresignedUploadUrl: mockCreatePresignedUploadUrl,
    createPresignedDownloadUrl: mockCreatePresignedDownloadUrl,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
    error: mockLoggerError,
  },
}));

import { handleAdminRouteError } from "@/app/api/admin/_utils";
import { POST as loginPost } from "@/app/api/admin/login/route";
import { POST as logoutPost } from "@/app/api/admin/logout/route";
import { GET as meGet } from "@/app/api/admin/me/route";
import { GET as paymentsGet } from "@/app/api/admin/payments/route";
import { GET as requestsGet } from "@/app/api/admin/requests/route";
import { GET as requestDetailGet } from "@/app/api/admin/requests/[id]/route";
import { PATCH as requestStatusPatch } from "@/app/api/admin/requests/[id]/status/route";
import { POST as deliverableUploadUrlPost } from "@/app/api/admin/requests/[id]/deliverables/upload-url/route";
import { POST as deliverableCreatePost } from "@/app/api/admin/requests/[id]/deliverables/route";
import {
  GET as servicesGet,
  POST as servicesPost,
} from "@/app/api/admin/services/route";
import {
  DELETE as serviceDelete,
  PATCH as servicePatch,
} from "@/app/api/admin/services/[id]/route";
import { GET as shopGet, PATCH as shopPatch } from "@/app/api/admin/shop/route";
import { GET as staffGet, POST as staffPost } from "@/app/api/admin/staff/route";
import { DELETE as staffDelete } from "@/app/api/admin/staff/[id]/route";

const ORIGINAL_ENV = { ...process.env };
const TEST_SECRET = "test-admin-session-secret-32-chars!!";

function createCookieStore(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const setCalls: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];
  const deleteCalls: string[] = [];

  return {
    get: vi.fn<(name: string) => { name: string; value: string } | undefined>(
      (name) => {
        const value = store.get(name);
        return value !== undefined ? { name, value } : undefined;
      }
    ),
    set: vi.fn<
      (name: string, value: string, options?: Record<string, unknown>) => void
    >((name, value, options) => {
      store.set(name, value);
      setCalls.push({ name, value, options });
    }),
    delete: vi.fn<(name: string) => void>((name) => {
      store.delete(name);
      deleteCalls.push(name);
    }),
    setCalls,
    deleteCalls,
  };
}

interface QueryResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface RecordedOperation {
  table: string;
  action: "select" | "insert" | "update" | "delete" | null;
  selectColumns: string | null;
  payload: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
}

/**
 * Chainable, awaitable Supabase query mock supporting sequential responses per call.
 */
function createSupabaseMock(responses: QueryResponse[]) {
  const operations: RecordedOperation[] = [];
  let cursor = 0;

  function nextResponse(): QueryResponse {
    if (cursor < responses.length) {
      return responses[cursor++];
    }
    return { data: null, error: null };
  }

  type QueryChain = {
    select: (cols: string) => QueryChain;
    insert: (payload: unknown) => QueryChain;
    update: (payload: unknown) => QueryChain;
    delete: () => QueryChain;
    eq: (col: string, val: unknown) => QueryChain;
    neq: (col: string, val: unknown) => QueryChain;
    not: (col: string, operator: string, val: unknown) => QueryChain;
    or: (expr: string) => QueryChain;
    gte: (col: string, val: unknown) => QueryChain;
    lte: (col: string, val: unknown) => QueryChain;
    order: (col: string, opts?: unknown) => QueryChain;
    limit: (count: number) => QueryChain;
    maybeSingle: () => Promise<QueryResponse>;
    single: () => Promise<QueryResponse>;
    then: (
      onFulfilled?: (val: QueryResponse) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise<unknown>;
  };

  const from = vi.fn<(table: string) => QueryChain>((table: string) => {
    const op: RecordedOperation = {
      table,
      action: null,
      selectColumns: null,
      payload: undefined,
      filters: [],
    };
    operations.push(op);

    let resolved: QueryResponse | null = null;
    const ensureResolved = () => {
      if (!resolved) {
        resolved = nextResponse();
      }
      return resolved;
    };

    const chain: QueryChain = {
      select: vi.fn<(cols: string) => QueryChain>((cols) => {
        if (!op.action) op.action = "select";
        op.selectColumns = cols;
        return chain;
      }),
      insert: vi.fn<(payload: unknown) => QueryChain>((payload) => {
        op.action = "insert";
        op.payload = payload;
        return chain;
      }),
      update: vi.fn<(payload: unknown) => QueryChain>((payload) => {
        op.action = "update";
        op.payload = payload;
        return chain;
      }),
      delete: vi.fn<() => QueryChain>(() => {
        op.action = "delete";
        return chain;
      }),
      eq: vi.fn<(col: string, val: unknown) => QueryChain>((col, val) => {
        op.filters.push({ method: "eq", args: [col, val] });
        return chain;
      }),
      neq: vi.fn<(col: string, val: unknown) => QueryChain>((col, val) => {
        op.filters.push({ method: "neq", args: [col, val] });
        return chain;
      }),
      not: vi.fn<(col: string, operator: string, val: unknown) => QueryChain>(
        (col, operator, val) => {
          op.filters.push({ method: "not", args: [col, operator, val] });
          return chain;
        }
      ),
      or: vi.fn<(expr: string) => QueryChain>((expr) => {
        op.filters.push({ method: "or", args: [expr] });
        return chain;
      }),
      gte: vi.fn<(col: string, val: unknown) => QueryChain>((col, val) => {
        op.filters.push({ method: "gte", args: [col, val] });
        return chain;
      }),
      lte: vi.fn<(col: string, val: unknown) => QueryChain>((col, val) => {
        op.filters.push({ method: "lte", args: [col, val] });
        return chain;
      }),
      order: vi.fn<(col: string, opts?: unknown) => QueryChain>((col, opts) => {
        op.filters.push({ method: "order", args: [col, opts] });
        return chain;
      }),
      limit: vi.fn<(count: number) => QueryChain>((count) => {
        op.filters.push({ method: "limit", args: [count] });
        return chain;
      }),
      maybeSingle: vi.fn<() => Promise<QueryResponse>>(async () =>
        ensureResolved()
      ),
      single: vi.fn<() => Promise<QueryResponse>>(async () => ensureResolved()),
      then: (onFulfilled, onRejected) =>
        Promise.resolve(ensureResolved()).then(onFulfilled, onRejected),
    };

    return chain;
  });

  return {
    client: { from },
    operations,
    from,
  };
}

function makeJsonRequest(
  url: string,
  method: string,
  body?: unknown
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function setSessionCookie(staff: {
  staffId: string;
  username: string;
  role: "owner" | "admin";
}) {
  const token = signSessionToken(staff);
  const store = createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: token });
  mockCookies.mockResolvedValue(store);
  return store;
}

function staffAuthDbResponse(staff: {
  id: string;
  username: string;
  role: "owner" | "admin";
  is_active?: boolean;
}): QueryResponse {
  return {
    data: {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      is_active: staff.is_active ?? true,
    },
    error: null,
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    ADMIN_SESSION_SECRET: TEST_SECRET,
  };
  mockCookies.mockReset();
  mockConnection.mockClear();
  mockRevalidatePath.mockReset();
  mockRevalidateTag.mockReset();
  mockGetSupabaseAdmin.mockReset();
  mockCreatePresignedUploadUrl.mockReset();
  mockCreatePresignedDownloadUrl.mockReset();
  mockLoggerError.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe("Shared admin route error handling (_utils.ts)", () => {
  it("maps AuthError, malformed JSON, and unexpected errors cleanly", async () => {
    const authRes = handleAdminRouteError(new AuthError(403, "Forbidden"));
    expect(authRes.status).toBe(403);
    await expect(authRes.json()).resolves.toEqual({ error: "Forbidden" });

    const badJsonReq = new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json",
    });
    const badJsonRes = await loginPost(badJsonReq);
    expect(badJsonRes.status).toBe(400);
    await expect(badJsonRes.json()).resolves.toEqual({
      error: "Invalid JSON request body.",
    });

    const unexpectedRes = handleAdminRouteError(new Error("DB connection lost"));
    expect(unexpectedRes.status).toBe(500);
    await expect(unexpectedRes.json()).resolves.toEqual({
      error: "Internal server error.",
    });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});

describe("Admin auth routes (/api/admin/login, /logout, /me)", () => {
  it("logs in active staff, sets signed HTTP-only cookie, and returns staff info", async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const passwordHash = await hashPassword("OwnerPass123!");
    const db = createSupabaseMock([
      {
        data: {
          id: "staff-owner-1",
          username: "owner",
          role: "owner",
          password_hash: passwordHash,
          is_active: true,
        },
        error: null,
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const res = await loginPost(
      makeJsonRequest("http://localhost/api/admin/login", "POST", {
        username: "owner",
        password: "OwnerPass123!",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      staff: {
        id: "staff-owner-1",
        username: "owner",
        role: "owner",
      },
    });
    expect(cookieStore.setCalls).toHaveLength(1);
    expect(cookieStore.setCalls[0].name).toBe(ADMIN_SESSION_COOKIE_NAME);
    expect(db.operations[0].filters).toContainEqual({
      method: "eq",
      args: ["is_active", true],
    });
  });

  it("returns 401 on wrong password or unknown user and 400 on missing fields", async () => {
    const passwordHash = await hashPassword("CorrectPass99!");
    const db = createSupabaseMock([
      {
        data: {
          id: "staff-1",
          username: "admin1",
          role: "admin",
          password_hash: passwordHash,
          is_active: true,
        },
        error: null,
      },
      { data: null, error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const wrongPwRes = await loginPost(
      makeJsonRequest("http://localhost/api/admin/login", "POST", {
        username: "admin1",
        password: "WrongPassword!",
      })
    );
    expect(wrongPwRes.status).toBe(401);

    const unknownUserRes = await loginPost(
      makeJsonRequest("http://localhost/api/admin/login", "POST", {
        username: "nobody",
        password: "AnyPassword!",
      })
    );
    expect(unknownUserRes.status).toBe(401);

    const invalidBodyRes = await loginPost(
      makeJsonRequest("http://localhost/api/admin/login", "POST", {
        username: "",
        password: "",
      })
    );
    expect(invalidBodyRes.status).toBe(400);
    const invalidJson = await invalidBodyRes.json();
    expect(invalidJson.fieldErrors).toHaveProperty("username");
    expect(invalidJson.fieldErrors).toHaveProperty("password");
  });

  it("returns authenticated staff on GET /me and clears cookie on POST /logout", async () => {
    const cookieStore = setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      staffAuthDbResponse({
        id: "staff-admin-1",
        username: "desk1",
        role: "admin",
      }),
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const meRes = await meGet();
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.staff).toMatchObject({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });
    expect(mockConnection).toHaveBeenCalled();

    const logoutRes = await logoutPost();
    expect(logoutRes.status).toBe(200);
    await expect(logoutRes.json()).resolves.toEqual({ ok: true });
    expect(cookieStore.deleteCalls).toContain(ADMIN_SESSION_COOKIE_NAME);
  });

  it("returns 401 on GET /me when unauthenticated", async () => {
    mockCookies.mockResolvedValue(createCookieStore());
    const res = await meGet();
    expect(res.status).toBe(401);
  });
});

describe("RBAC & Owner-only Staff Management (/api/admin/staff)", () => {
  it("forbids admin role (403) from GET, POST, and DELETE /api/admin/staff*", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      staffAuthDbResponse({
        id: "staff-admin-1",
        username: "desk1",
        role: "admin",
      }),
      staffAuthDbResponse({
        id: "staff-admin-1",
        username: "desk1",
        role: "admin",
      }),
      staffAuthDbResponse({
        id: "staff-admin-1",
        username: "desk1",
        role: "admin",
      }),
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const listRes = await staffGet();
    expect(listRes.status).toBe(403);

    const createRes = await staffPost(
      makeJsonRequest("http://localhost/api/admin/staff", "POST", {
        username: "newdesk",
        password: "Password123!",
      })
    );
    expect(createRes.status).toBe(403);

    const deleteRes = await staffDelete(
      new Request("http://localhost/api/admin/staff/staff-admin-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "staff-admin-2" }) }
    );
    expect(deleteRes.status).toBe(403);
  });

  it("allows owner to list staff without password_hash and create/delete admin accounts", async () => {
    setSessionCookie({
      staffId: "staff-owner-1",
      username: "owner",
      role: "owner",
    });

    const db = createSupabaseMock([
      // GET /staff -> requireOwner + list
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      {
        data: [
          {
            id: "staff-owner-1",
            username: "owner",
            role: "owner",
            is_active: true,
            created_at: "2026-11-26T10:00:00Z",
            created_by: null,
          },
        ],
        error: null,
      },
      // POST /staff -> requireOwner + insert
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      {
        data: {
          id: "staff-admin-2",
          username: "desk_2",
          role: "admin",
          is_active: true,
          created_at: "2026-11-26T11:00:00Z",
          created_by: "staff-owner-1",
        },
        error: null,
      },
      // DELETE /staff/staff-admin-2 -> requireOwner + lookup + delete
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      { data: { id: "staff-admin-2", role: "admin" }, error: null },
      { data: { id: "staff-admin-2" }, error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const listRes = await staffGet();
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.staff).toHaveLength(1);
    expect(db.operations[1].selectColumns).not.toContain("password_hash");

    const createRes = await staffPost(
      makeJsonRequest("http://localhost/api/admin/staff", "POST", {
        username: "desk_2",
        password: "StrongPassword!1",
      })
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.staff.username).toBe("desk_2");
    expect(createBody.staff.role).toBe("admin");
    expect(createBody.staff).not.toHaveProperty("password_hash");

    const insertPayload = db.operations[3].payload as {
      role: string;
      created_by: string;
      password_hash: string;
    };
    expect(insertPayload.role).toBe("admin");
    expect(insertPayload.created_by).toBe("staff-owner-1");
    expect(insertPayload.password_hash).toMatch(/^scrypt:/);

    const deleteRes = await staffDelete(
      new Request("http://localhost/api/admin/staff/staff-admin-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "staff-admin-2" }) }
    );
    expect(deleteRes.status).toBe(200);
    await expect(deleteRes.json()).resolves.toEqual({ ok: true });
  });

  it("prevents owner from deleting self (400) or another owner (403)", async () => {
    setSessionCookie({
      staffId: "staff-owner-1",
      username: "owner",
      role: "owner",
    });

    const db = createSupabaseMock([
      // Self delete -> requireOwner
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      // Other owner delete -> requireOwner + lookup
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      { data: { id: "staff-owner-2", role: "owner" }, error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const selfRes = await staffDelete(
      new Request("http://localhost/api/admin/staff/staff-owner-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "staff-owner-1" }) }
    );
    expect(selfRes.status).toBe(400);

    const otherOwnerRes = await staffDelete(
      new Request("http://localhost/api/admin/staff/staff-owner-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "staff-owner-2" }) }
    );
    expect(otherOwnerRes.status).toBe(403);
  });

  it("returns 409 on duplicate staff username", async () => {
    setSessionCookie({
      staffId: "staff-owner-1",
      username: "owner",
      role: "owner",
    });

    const db = createSupabaseMock([
      staffAuthDbResponse({ id: "staff-owner-1", username: "owner", role: "owner" }),
      {
        data: null,
        error: { message: "duplicate key value", code: "23505" },
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const res = await staffPost(
      makeJsonRequest("http://localhost/api/admin/staff", "POST", {
        username: "existing_admin",
        password: "StrongPassword!1",
      })
    );
    expect(res.status).toBe(409);
  });
});

describe("Shop settings & Services configurator routes", () => {
  it("fetches and updates shop_settings and revalidates storefront cache", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const shopRow = {
      id: 1,
      is_open: false,
      phone: "+91 9876543210",
      whatsapp: "+91 9876543210",
      email: "shop@example.com",
      address: "Main Market",
      closed_notice: "Closed for lunch",
      updated_at: "2026-11-26T12:00:00Z",
    };

    const db = createSupabaseMock([
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: shopRow, error: null },
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: { ...shopRow, is_open: true }, error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const getRes = await shopGet();
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({ shop: shopRow });

    const patchRes = await shopPatch(
      makeJsonRequest("http://localhost/api/admin/shop", "PATCH", {
        isOpen: true,
      })
    );
    expect(patchRes.status).toBe(200);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidateTag).toHaveBeenCalledWith("shop-settings", "max");
  });

  it("creates, updates with cross-validation, and protects referenced services on delete", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const formSchema = [
      {
        key: "copies",
        label: "Copies",
        type: "number",
        required: true,
        min: 1,
      },
    ];
    const pricingRules = [
      {
        id: "per_copy",
        label: "Per Copy",
        type: "per_unit",
        fieldKey: "copies",
        unitPricePaise: 500,
      },
    ];

    const db = createSupabaseMock([
      // GET /services
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: [], error: null },
      // POST /services (valid)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "svc-1",
          slug: "print-service",
          name: "Print Service",
          form_schema: formSchema,
          pricing_rules: pricingRules,
        },
        error: null,
      },
      // PATCH /services/svc-1 (invalid pricingRule referencing missing field) -> auth + fetch existing
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "svc-1",
          form_schema: formSchema,
          pricing_rules: pricingRules,
        },
        error: null,
      },
      // DELETE /services/svc-1 (FK 23503) -> auth + delete error
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: null,
        error: { message: "violates foreign key constraint", code: "23503" },
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const listRes = await servicesGet();
    expect(listRes.status).toBe(200);

    const createRes = await servicesPost(
      makeJsonRequest("http://localhost/api/admin/services", "POST", {
        slug: "print-service",
        name: "Print Service",
        basePricePaise: 2000,
        formSchema,
        pricingRules,
      })
    );
    expect(createRes.status).toBe(201);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidateTag).toHaveBeenCalledWith("services", "max");

    const badPatchRes = await servicePatch(
      makeJsonRequest("http://localhost/api/admin/services/svc-1", "PATCH", {
        pricingRules: [
          {
            id: "broken",
            label: "Broken Rule",
            type: "per_unit",
            fieldKey: "nonexistent_field",
            unitPricePaise: 100,
          },
        ],
      }),
      { params: Promise.resolve({ id: "svc-1" }) }
    );
    expect(badPatchRes.status).toBe(400);
    const badPatchBody = await badPatchRes.json();
    expect(badPatchBody.fieldErrors).toHaveProperty("pricingRules.0.fieldKey");

    const fkDeleteRes = await serviceDelete(
      new Request("http://localhost/api/admin/services/svc-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "svc-1" }) }
    );
    expect(fkDeleteRes.status).toBe(409);
    await expect(fkDeleteRes.json()).resolves.toEqual({
      error: "Service has existing work requests. Disable it instead of deleting.",
    });
  });
});

describe("Work Queue, Lost-Token Search & Fulfillment Workflows", () => {
  it("excludes INITIATED and DRAFT_AWAITING_ADVANCE by default, supports INITIATED filter, and passes q + date filters cleanly", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      // Default query
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: [{ id: "req-1", token: "OC-2026-0001" }], error: null },
      // Search + date window + explicit status=ALL
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: [{ id: "req-2", customer_phone: "9876543210" }], error: null },
      // Explicit status=INITIATED
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      { data: [{ id: "req-3", status: "INITIATED" }], error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const defaultRes = await requestsGet(
      new Request("http://localhost/api/admin/requests")
    );
    expect(defaultRes.status).toBe(200);
    const defaultOp = db.operations[1];
    expect(defaultOp.filters).toContainEqual({
      method: "not",
      args: ["status", "in", '("INITIATED","DRAFT_AWAITING_ADVANCE")'],
    });

    const searchRes = await requestsGet(
      new Request(
        "http://localhost/api/admin/requests?status=ALL&q=98765&from=2026-11-25&to=2026-11-26"
      )
    );
    expect(searchRes.status).toBe(200);
    const searchOp = db.operations[3];
    expect(searchOp.filters).toContainEqual({
      method: "or",
      args: [
        "token.ilike.%98765%,customer_phone.ilike.%98765%,customer_email.ilike.%98765%",
      ],
    });
    expect(searchOp.filters).toContainEqual({
      method: "gte",
      args: ["created_at", "2026-11-25T00:00:00.000Z"],
    });
    expect(searchOp.filters).toContainEqual({
      method: "lte",
      args: ["created_at", "2026-11-26T23:59:59.999Z"],
    });
    expect(
      searchOp.filters.some(
        (filter) => filter.method === "neq" || filter.method === "not"
      )
    ).toBe(false);

    const initiatedRes = await requestsGet(
      new Request("http://localhost/api/admin/requests?status=INITIATED")
    );
    expect(initiatedRes.status).toBe(200);
    const initiatedOp = db.operations[5];
    expect(initiatedOp.filters).toContainEqual({
      method: "eq",
      args: ["status", "INITIATED"],
    });
  });

  it("enforces status transition rules: blocks INITIATED/DRAFT_AWAITING_ADVANCE processing, COMPLETED requires deliverable & sets 14d expiry, CANCELED requires reason & sets 24h expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00.000Z"));
    const expectedCompletedExpiry = new Date(
      Date.UTC(2026, 10, 26, 12, 0, 0) + 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const expectedCanceledExpiry = new Date(
      Date.UTC(2026, 10, 26, 12, 0, 0) + 24 * 60 * 60 * 1000
    ).toISOString();

    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      // 1a. INITIATED -> IN_PROGRESS (rejected)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-init",
          status: "INITIATED",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
      // 1b. INITIATED -> COMPLETED (rejected)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-init",
          status: "INITIATED",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
      // 1c. DRAFT_AWAITING_ADVANCE -> IN_PROGRESS (rejected)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-draft",
          status: "DRAFT_AWAITING_ADVANCE",
          service_snapshot: { isCollectibleOnline: true },
        },
        error: null,
      },
      // 2. IN_PROGRESS -> COMPLETED without deliverable for online-collectible (rejected)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-online",
          status: "IN_PROGRESS",
          service_snapshot: { isCollectibleOnline: true },
        },
        error: null,
      },
      { data: [], error: null },
      // 3. IN_PROGRESS -> COMPLETED with deliverable present (succeeds, 14-day expiry)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-online",
          status: "IN_PROGRESS",
          service_snapshot: { isCollectibleOnline: true },
        },
        error: null,
      },
      { data: [{ id: "file-out-1" }], error: null },
      {
        data: {
          id: "req-online",
          status: "COMPLETED",
          terminal_at: "2026-11-26T12:00:00.000Z",
          files_expire_at: expectedCompletedExpiry,
        },
        error: null,
      },
      // 4. PENDING -> CANCELED without reason (rejected)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-cancel",
          status: "PENDING",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
      // 5. PENDING -> CANCELED with valid reason (succeeds + sets 24-hour expiry)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-cancel",
          status: "PENDING",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
      {
        data: {
          id: "req-cancel",
          status: "CANCELED",
          cancellation_reason: "Blurry Aadhaar scan provided",
          terminal_at: "2026-11-26T12:00:00.000Z",
          files_expire_at: expectedCanceledExpiry,
        },
        error: null,
      },
      // 6. INITIATED -> CANCELED with valid reason (allowed + sets 24-hour expiry)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-init",
          status: "INITIATED",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
      {
        data: {
          id: "req-init",
          status: "CANCELED",
          cancellation_reason: "Abandoned upload cleaned by staff",
          terminal_at: "2026-11-26T12:00:00.000Z",
          files_expire_at: expectedCanceledExpiry,
        },
        error: null,
      },
      // 7. COMPLETED -> IN_PROGRESS (rejected terminal transition)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-done",
          status: "COMPLETED",
          service_snapshot: { isCollectibleOnline: false },
        },
        error: null,
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    // 1a. INITIATED cannot move to IN_PROGRESS
    const initProgressRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-init/status", "PATCH", {
        status: "IN_PROGRESS",
      }),
      { params: Promise.resolve({ id: "req-init" }) }
    );
    expect(initProgressRes.status).toBe(400);
    await expect(initProgressRes.json()).resolves.toMatchObject({
      error: "Cannot process or complete an incomplete request before uploads finish.",
    });

    // 1b. INITIATED cannot move to COMPLETED
    const initCompleteRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-init/status", "PATCH", {
        status: "COMPLETED",
      }),
      { params: Promise.resolve({ id: "req-init" }) }
    );
    expect(initCompleteRes.status).toBe(400);

    // 1c. Draft cannot move to IN_PROGRESS
    const draftRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-draft/status", "PATCH", {
        status: "IN_PROGRESS",
      }),
      { params: Promise.resolve({ id: "req-draft" }) }
    );
    expect(draftRes.status).toBe(400);

    // 2. Online collectible cannot complete without deliverable
    const missingOutputRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-online/status", "PATCH", {
        status: "COMPLETED",
      }),
      { params: Promise.resolve({ id: "req-online" }) }
    );
    expect(missingOutputRes.status).toBe(400);

    // 3. Online collectible completes once deliverable exists (14-day expiry)
    const completeRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-online/status", "PATCH", {
        status: "COMPLETED",
      }),
      { params: Promise.resolve({ id: "req-online" }) }
    );
    expect(completeRes.status).toBe(200);
    const completeUpdate = db.operations[12].payload as {
      status: string;
      terminal_at: string;
      files_expire_at: string;
    };
    expect(completeUpdate.status).toBe("COMPLETED");
    expect(completeUpdate.terminal_at).toBe("2026-11-26T12:00:00.000Z");
    expect(completeUpdate.files_expire_at).toBe(expectedCompletedExpiry);

    // 4. Cancel requires reason >= 3 chars
    const noReasonRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-cancel/status", "PATCH", {
        status: "CANCELED",
        cancellationReason: "no",
      }),
      { params: Promise.resolve({ id: "req-cancel" }) }
    );
    expect(noReasonRes.status).toBe(400);

    // 5. Cancel succeeds with valid reason and 24-hour expiry
    const cancelRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-cancel/status", "PATCH", {
        status: "CANCELED",
        cancellationReason: "Blurry Aadhaar scan provided",
      }),
      { params: Promise.resolve({ id: "req-cancel" }) }
    );
    expect(cancelRes.status).toBe(200);
    const cancelUpdate = db.operations[17].payload as {
      status: string;
      cancellation_reason: string;
      terminal_at: string;
      files_expire_at: string;
    };
    expect(cancelUpdate).toEqual({
      status: "CANCELED",
      cancellation_reason: "Blurry Aadhaar scan provided",
      terminal_at: "2026-11-26T12:00:00.000Z",
      files_expire_at: expectedCanceledExpiry,
    });

    // 6. INITIATED can be CANCELED with reason and gets 24-hour expiry
    const initCancelRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-init/status", "PATCH", {
        status: "CANCELED",
        cancellationReason: "Abandoned upload cleaned by staff",
      }),
      { params: Promise.resolve({ id: "req-init" }) }
    );
    expect(initCancelRes.status).toBe(200);
    const initCancelUpdate = db.operations[20].payload as {
      status: string;
      files_expire_at: string;
    };
    expect(initCancelUpdate.status).toBe("CANCELED");
    expect(initCancelUpdate.files_expire_at).toBe(expectedCanceledExpiry);

    // 7. Terminal status cannot transition out
    const terminalRes = await requestStatusPatch(
      makeJsonRequest("http://localhost/api/admin/requests/req-done/status", "PATCH", {
        status: "IN_PROGRESS",
      }),
      { params: Promise.resolve({ id: "req-done" }) }
    );
    expect(terminalRes.status).toBe(400);
  });

  it("rejects deliverable upload URLs for INITIATED, DRAFT_AWAITING_ADVANCE, and CANCELED requests", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: { id: "req-init", status: "INITIATED", files_purged_at: null },
        error: null,
      },
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-draft",
          status: "DRAFT_AWAITING_ADVANCE",
          files_purged_at: null,
        },
        error: null,
      },
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: { id: "req-canceled", status: "CANCELED", files_purged_at: null },
        error: null,
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    for (const id of ["req-init", "req-draft", "req-canceled"]) {
      const res = await deliverableUploadUrlPost(
        makeJsonRequest(
          `http://localhost/api/admin/requests/${id}/deliverables/upload-url`,
          "POST",
          {
            filename: "receipt.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
          }
        ),
        { params: Promise.resolve({ id }) }
      );
      expect(res.status).toBe(400);
    }
    expect(mockCreatePresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("issues deliverable upload URLs, registers output files, and generates presigned download URLs", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    mockCreatePresignedUploadUrl.mockResolvedValue("https://r2.example/upload-put");
    mockCreatePresignedDownloadUrl.mockImplementation(
      async ({ storageKey }) => `https://r2.example/download?key=${storageKey}`
    );

    const db = createSupabaseMock([
      // 1. upload-url
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: { id: "req-1", status: "IN_PROGRESS", files_purged_at: null },
        error: null,
      },
      // 2. register deliverable (bad prefix rejected after auth)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      // 3. register deliverable (valid)
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: { id: "req-1", status: "IN_PROGRESS", files_purged_at: null },
        error: null,
      },
      {
        data: {
          id: "file-out-1",
          request_id: "req-1",
          direction: "output",
          storage_key: "requests/req-1/outputs/abc-receipt.pdf",
          original_filename: "receipt.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          uploaded_by_staff_id: "staff-admin-1",
        },
        error: null,
      },
      // 4. GET /requests/req-1
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: {
          id: "req-1",
          token: "OC-2026-0001",
          status: "IN_PROGRESS",
          files_purged_at: null,
        },
        error: null,
      },
      {
        data: [
          {
            id: "file-in-1",
            direction: "input",
            storage_key: "requests/req-1/inputs/aadhaar/1-id.pdf",
            original_filename: "id.pdf",
          },
          {
            id: "file-out-1",
            direction: "output",
            storage_key: "requests/req-1/outputs/abc-receipt.pdf",
            original_filename: "receipt.pdf",
          },
        ],
        error: null,
      },
      { data: [{ id: "pay-1", amount_paise: 15000 }], error: null },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const uploadUrlRes = await deliverableUploadUrlPost(
      makeJsonRequest(
        "http://localhost/api/admin/requests/req-1/deliverables/upload-url",
        "POST",
        {
          filename: "receipt.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        }
      ),
      { params: Promise.resolve({ id: "req-1" }) }
    );
    expect(uploadUrlRes.status).toBe(200);
    const uploadUrlBody = await uploadUrlRes.json();
    expect(uploadUrlBody.uploadUrl).toBe("https://r2.example/upload-put");
    expect(uploadUrlBody.storageKey).toMatch(/^requests\/req-1\/outputs\/.+-receipt\.pdf$/);

    const badDeliverableRes = await deliverableCreatePost(
      makeJsonRequest("http://localhost/api/admin/requests/req-1/deliverables", "POST", {
        storageKey: "requests/other-req/outputs/evil.pdf",
        originalFilename: "evil.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
      }),
      { params: Promise.resolve({ id: "req-1" }) }
    );
    expect(badDeliverableRes.status).toBe(400);

    const deliverableRes = await deliverableCreatePost(
      makeJsonRequest("http://localhost/api/admin/requests/req-1/deliverables", "POST", {
        storageKey: "requests/req-1/outputs/abc-receipt.pdf",
        originalFilename: "receipt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      }),
      { params: Promise.resolve({ id: "req-1" }) }
    );
    expect(deliverableRes.status).toBe(201);
    expect(db.operations[5].payload).toMatchObject({
      request_id: "req-1",
      direction: "output",
      uploaded_by_staff_id: "staff-admin-1",
    });

    const detailRes = await requestDetailGet(
      new Request("http://localhost/api/admin/requests/req-1"),
      { params: Promise.resolve({ id: "req-1" }) }
    );
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.inputFiles[0].downloadUrl).toContain("requests/req-1/inputs/aadhaar/1-id.pdf");
    expect(detailBody.outputFiles[0].downloadUrl).toContain("requests/req-1/outputs/abc-receipt.pdf");
    expect(detailBody.payments).toHaveLength(1);
  });

  it("lists payments joined with work_requests on GET /api/admin/payments", async () => {
    setSessionCookie({
      staffId: "staff-admin-1",
      username: "desk1",
      role: "admin",
    });

    const db = createSupabaseMock([
      staffAuthDbResponse({ id: "staff-admin-1", username: "desk1", role: "admin" }),
      {
        data: [
          {
            id: "pay-1",
            amount_paise: 25000,
            payment_type: "advance",
            status: "SUCCESS",
            work_requests: {
              token: "OC-2026-0001",
              customer_phone: "+91 9876543210",
              customer_email: null,
              status: "IN_PROGRESS",
              total_amount_paise: 50000,
              advance_required_paise: 25000,
              amount_paid_paise: 25000,
              service_snapshot: { name: "JEE Form" },
            },
          },
        ],
        error: null,
      },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(db.client);

    const res = await paymentsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].work_requests.token).toBe("OC-2026-0001");
    expect(db.operations[1].filters).toContainEqual({
      method: "limit",
      args: [200],
    });
  });
});
