import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const { mockCookies, mockGetSupabaseAdmin } = vi.hoisted(() => ({
  mockCookies: vi.fn<() => Promise<ReturnType<typeof createCookieStore>>>(),
  mockGetSupabaseAdmin: vi.fn<() => unknown>(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/lib/db/supabase-admin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

import {
  ADMIN_SESSION_COOKIE_NAME,
  AuthError,
  clearStaffSessionCookie,
  getStaffSessionFromCookies,
  requireOwner,
  requireStaff,
  setStaffSessionCookie,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";
import { config as proxyConfig, proxy } from "@/proxy";

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

interface StaffQueryResult {
  data: {
    id: string;
    username: string;
    role: string;
    is_active: boolean;
  } | null;
  error: { message: string } | null;
}

function createSupabaseStaffMock(result: StaffQueryResult) {
  const maybeSingle = vi.fn<() => Promise<StaffQueryResult>>().mockResolvedValue(result);
  const eq = vi
    .fn<(col: string, val: string) => { maybeSingle: typeof maybeSingle }>()
    .mockReturnValue({ maybeSingle });
  const select = vi
    .fn<(cols: string) => { eq: typeof eq }>()
    .mockReturnValue({ eq });
  const from = vi
    .fn<(table: string) => { select: typeof select }>()
    .mockReturnValue({ select });

  return {
    client: { from },
    from,
    select,
    eq,
    maybeSingle,
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    ADMIN_SESSION_SECRET: TEST_SECRET,
  };
  mockCookies.mockReset();
  mockGetSupabaseAdmin.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe("Password hashing & verification (lib/auth/password.ts)", () => {
  it("hashes password in scrypt:<saltHex>:<hashHex> format and verifies it", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const parts = hash.split(":");

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]{128}$/);

    await expect(verifyPassword("correct-horse-battery", hash)).resolves.toBe(
      true
    );
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("uses unique random salts per hash call", async () => {
    const hashA = await hashPassword("same-password-123");
    const hashB = await hashPassword("same-password-123");

    expect(hashA).not.toBe(hashB);
    await expect(verifyPassword("same-password-123", hashA)).resolves.toBe(true);
    await expect(verifyPassword("same-password-123", hashB)).resolves.toBe(true);
  });

  it("verifies hashes produced by the exact scripts/seed.ts scryptSync pattern", async () => {
    const password = "SeededOwnerPassword!99";
    const saltHex = crypto.randomBytes(16).toString("hex");
    const hashHex = crypto.scryptSync(password, saltHex, 64).toString("hex");
    const seededHash = `scrypt:${saltHex}:${hashHex}`;

    await expect(verifyPassword(password, seededHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-seed-pw", seededHash)).resolves.toBe(
      false
    );
  });

  it("rejects empty, whitespace-only, and short (< 6 chars) passwords when hashing", async () => {
    await expect(hashPassword("")).rejects.toThrow(/empty/i);
    await expect(hashPassword("     ")).rejects.toThrow(/empty/i);
    await expect(hashPassword("12345")).rejects.toThrow(/at least 6/i);
  });

  it("returns false for malformed, wrong-length, or tampered hashes", async () => {
    const validHash = await hashPassword("valid-secret-pw");
    const lastChar = validHash.slice(-1);
    const flippedLastChar = lastChar === "a" ? "b" : "a";
    const tamperedHash = `${validHash.slice(0, -1)}${flippedLastChar}`;

    await expect(verifyPassword("valid-secret-pw", tamperedHash)).resolves.toBe(
      false
    );
    await expect(verifyPassword("", validHash)).resolves.toBe(false);
    await expect(verifyPassword("valid-secret-pw", "")).resolves.toBe(false);
    await expect(
      verifyPassword("valid-secret-pw", "bcrypt:1234:5678")
    ).resolves.toBe(false);
    await expect(
      verifyPassword("valid-secret-pw", "scrypt:onlytwo")
    ).resolves.toBe(false);
    await expect(
      verifyPassword("valid-secret-pw", "scrypt:abcd:zzzz")
    ).resolves.toBe(false);
    await expect(
      verifyPassword("valid-secret-pw", "scrypt:abcd:0123456789abcdef")
    ).resolves.toBe(false);
  });
});

describe("Session token signing & verification (lib/auth/session.ts)", () => {
  it("throws a clear error when ADMIN_SESSION_SECRET is missing or shorter than 16 chars", () => {
    delete process.env.ADMIN_SESSION_SECRET;

    expect(() =>
      signSessionToken({ staffId: "staff-1", username: "owner", role: "owner" })
    ).toThrow(/ADMIN_SESSION_SECRET/);
    expect(() => verifySessionToken("abc.def")).toThrow(
      /ADMIN_SESSION_SECRET/
    );

    process.env.ADMIN_SESSION_SECRET = "too-short-15chr";
    expect(() =>
      signSessionToken({ staffId: "staff-1", username: "owner", role: "owner" })
    ).toThrow(/16/);
    expect(() => verifySessionToken("abc.def")).toThrow(/16/);
  });

  it("signs and verifies valid owner and admin tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));

    const token = signSessionToken(
      { staffId: "uuid-1", username: "owner", role: "owner" },
      3600
    );
    const verified = verifySessionToken(token);

    expect(verified).toEqual({
      staffId: "uuid-1",
      username: "owner",
      role: "owner",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("returns null for expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));

    const token = signSessionToken(
      { staffId: "uuid-2", username: "admin1", role: "admin" },
      60
    );

    expect(verifySessionToken(token)).not.toBeNull();

    // Advance exactly to exp -> exp > now is false
    vi.advanceTimersByTime(60 * 1000);
    expect(verifySessionToken(token)).toBeNull();
  });

  it("returns null for tampered payload, tampered signature, wrong secret, or malformed tokens", () => {
    const token = signSessionToken({
      staffId: "uuid-3",
      username: "admin1",
      role: "admin",
    });
    const [payloadB64, sigB64] = token.split(".");

    // Tamper payload (escalate role to owner)
    const tamperedPayloadB64 = Buffer.from(
      JSON.stringify({
        staffId: "uuid-3",
        username: "admin1",
        role: "owner",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      "utf8"
    ).toString("base64url");
    expect(verifySessionToken(`${tamperedPayloadB64}.${sigB64}`)).toBeNull();

    // Tamper signature
    const flippedSig = `${sigB64.slice(0, -1)}${sigB64.endsWith("A") ? "B" : "A"}`;
    expect(verifySessionToken(`${payloadB64}.${flippedSig}`)).toBeNull();

    // Wrong secret
    process.env.ADMIN_SESSION_SECRET = "completely-different-secret-key-999";
    expect(verifySessionToken(token)).toBeNull();

    // Malformed strings
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("no-dot-separator")).toBeNull();
    expect(verifySessionToken("a.b.c")).toBeNull();
    expect(verifySessionToken(".sig")).toBeNull();
    expect(verifySessionToken("payload.")).toBeNull();

    // Validly signed token with invalid role
    const badRolePayload = Buffer.from(
      JSON.stringify({
        staffId: "uuid-4",
        username: "hacker",
        role: "superadmin",
        iat: 1,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      "utf8"
    ).toString("base64url");
    const badRoleSig = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(badRolePayload)
      .digest("base64url");
    expect(verifySessionToken(`${badRolePayload}.${badRoleSig}`)).toBeNull();
  });
});

describe("Cookie helpers & server authorization guards (lib/auth/session.ts)", () => {
  it("sets and clears the HTTP-only oc_admin_session cookie", async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const token = signSessionToken({
      staffId: "uuid-10",
      username: "owner",
      role: "owner",
    });

    await setStaffSessionCookie(token, 1800);

    expect(cookieStore.set).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE_NAME,
      token,
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
        maxAge: 1800,
      }
    );

    const session = await getStaffSessionFromCookies();
    expect(session?.staffId).toBe("uuid-10");

    await clearStaffSessionCookie();
    expect(cookieStore.delete).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE_NAME);
    await expect(getStaffSessionFromCookies()).resolves.toBeNull();
  });

  it("requireStaff throws AuthError(401) when cookie is missing or token is invalid", async () => {
    mockCookies.mockResolvedValue(createCookieStore());

    await expect(requireStaff()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });

    mockCookies.mockResolvedValue(
      createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: "invalid.token" })
    );

    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("requireStaff throws AuthError(401) when staff user is missing or inactive in DB", async () => {
    const token = signSessionToken({
      staffId: "staff-missing",
      username: "ghost",
      role: "admin",
    });
    mockCookies.mockResolvedValue(
      createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: token })
    );

    const missingDb = createSupabaseStaffMock({ data: null, error: null });
    mockGetSupabaseAdmin.mockReturnValue(missingDb.client);

    await expect(requireStaff()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });

    const inactiveDb = createSupabaseStaffMock({
      data: {
        id: "staff-missing",
        username: "ghost",
        role: "admin",
        is_active: false,
      },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(inactiveDb.client);

    await expect(requireStaff()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
  });

  it("requireStaff returns fresh DB username/role for active staff", async () => {
    const token = signSessionToken({
      staffId: "staff-123",
      username: "old-name",
      role: "admin",
    });
    mockCookies.mockResolvedValue(
      createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: token })
    );

    const activeDb = createSupabaseStaffMock({
      data: {
        id: "staff-123",
        username: "new-name",
        role: "owner",
        is_active: true,
      },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(activeDb.client);

    const staff = await requireStaff();
    expect(staff.staffId).toBe("staff-123");
    expect(staff.username).toBe("new-name");
    expect(staff.role).toBe("owner");
    expect(activeDb.from).toHaveBeenCalledWith("staff_users");
    expect(activeDb.eq).toHaveBeenCalledWith("id", "staff-123");
  });

  it("requireOwner throws AuthError(403) for active admin and succeeds for active owner", async () => {
    const adminToken = signSessionToken({
      staffId: "staff-admin",
      username: "desk-admin",
      role: "admin",
    });
    mockCookies.mockResolvedValue(
      createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: adminToken })
    );

    const adminDb = createSupabaseStaffMock({
      data: {
        id: "staff-admin",
        username: "desk-admin",
        role: "admin",
        is_active: true,
      },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(adminDb.client);

    await expect(requireOwner()).rejects.toBeInstanceOf(AuthError);
    await expect(requireOwner()).rejects.toMatchObject({ status: 403 });

    const ownerToken = signSessionToken({
      staffId: "staff-owner",
      username: "owner",
      role: "owner",
    });
    mockCookies.mockResolvedValue(
      createCookieStore({ [ADMIN_SESSION_COOKIE_NAME]: ownerToken })
    );

    const ownerDb = createSupabaseStaffMock({
      data: {
        id: "staff-owner",
        username: "owner",
        role: "owner",
        is_active: true,
      },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(ownerDb.client);

    const owner = await requireOwner();
    expect(owner.staffId).toBe("staff-owner");
    expect(owner.role).toBe("owner");
  });
});

describe("Next.js 16 proxy.ts", () => {
  it("matches /admin routes and excludes public routes", () => {
    expect(
      unstable_doesMiddlewareMatch({ config: proxyConfig, url: "/admin" })
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config: proxyConfig, url: "/admin/login" })
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: "/admin/requests/123",
      })
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config: proxyConfig, url: "/" })
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({ config: proxyConfig, url: "/services/jee" })
    ).toBe(false);
  });

  it("allows /admin/login without a session cookie", () => {
    const req = new NextRequest("http://localhost:3000/admin/login");
    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /admin and /admin/* without a valid cookie to /admin/login", () => {
    const noCookieReq = new NextRequest("http://localhost:3000/admin");
    const noCookieRes = proxy(noCookieReq);

    expect(noCookieRes.status).toBe(307);
    expect(noCookieRes.headers.get("location")).toBe(
      "http://localhost:3000/admin/login"
    );

    const badCookieReq = new NextRequest(
      "http://localhost:3000/admin/requests",
      {
        headers: {
          cookie: `${ADMIN_SESSION_COOKIE_NAME}=tampered.cookie`,
        },
      }
    );
    const badCookieRes = proxy(badCookieReq);

    expect(badCookieRes.status).toBe(307);
    expect(badCookieRes.headers.get("location")).toBe(
      "http://localhost:3000/admin/login"
    );
  });

  it("allows /admin and /admin/* with a valid signed session cookie", () => {
    const token = signSessionToken({
      staffId: "staff-1",
      username: "owner",
      role: "owner",
    });

    const req = new NextRequest("http://localhost:3000/admin", {
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=${token}`,
      },
    });
    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
