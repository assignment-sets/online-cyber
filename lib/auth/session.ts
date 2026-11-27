import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
  type StaffRole,
  type StaffSession,
} from "./token";

export {
  ADMIN_SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
  type StaffRole,
  type StaffSession,
};

/**
 * Authorization error thrown by `requireStaff` and `requireOwner` for clean 401/403 API responses.
 */
export class AuthError extends Error {
  public readonly status: 401 | 403;

  constructor(
    status: 401 | 403,
    message = status === 401 ? "Unauthorized" : "Forbidden"
  ) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Sets the signed HTTP-only admin session cookie on the outgoing response.
 */
export async function setStaffSessionCookie(
  token: string,
  maxAgeSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  });
}

/**
 * Clears the admin session cookie.
 */
export async function clearStaffSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

/**
 * Reads and verifies the staff session token from the incoming request cookies.
 */
export async function getStaffSessionFromCookies(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

/**
 * Requires a valid, active staff session backed by a live `staff_users` row.
 * Throws `AuthError(401)` when unauthenticated or inactive.
 */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSessionFromCookies();
  if (!session) {
    throw new AuthError(401, "Authentication required.");
  }

  const supabase = getSupabaseAdmin();
  const { data: staff, error } = await supabase
    .from("staff_users")
    .select("id, username, role, is_active")
    .eq("id", session.staffId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify staff session: ${error.message}`);
  }

  if (!staff || staff.is_active !== true) {
    throw new AuthError(401, "Staff account is inactive or no longer exists.");
  }

  if (staff.role !== "owner" && staff.role !== "admin") {
    throw new AuthError(401, "Invalid staff role.");
  }

  return {
    staffId: staff.id,
    username: staff.username,
    role: staff.role,
    iat: session.iat,
    exp: session.exp,
  };
}

/**
 * Requires an active staff session with `owner` role.
 * Throws `AuthError(401)` if unauthenticated/inactive, or `AuthError(403)` if not an owner.
 */
export async function requireOwner(): Promise<StaffSession> {
  const staff = await requireStaff();
  if (staff.role !== "owner") {
    throw new AuthError(403, "Owner privileges required.");
  }
  return staff;
}
