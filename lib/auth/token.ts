import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "oc_admin_session";
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

const MIN_SESSION_SECRET_LENGTH = 16;

export type StaffRole = "owner" | "admin";

export interface StaffSession {
  staffId: string;
  username: string;
  role: StaffRole;
  iat: number;
  exp: number;
}

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.trim().length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `Missing or invalid ADMIN_SESSION_SECRET: must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`
    );
  }
  return secret;
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === "owner" || value === "admin";
}

/**
 * Signs a staff session payload into an HMAC-SHA256 base64url token (`<payloadB64>.<sigB64>`).
 */
export function signSessionToken(
  payload: Omit<StaffSession, "iat" | "exp">,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): string {
  if (!payload.staffId || !payload.username || !isStaffRole(payload.role)) {
    throw new Error("Invalid session payload.");
  }

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Session TTL must be a positive number of seconds.");
  }

  const secret = getSessionSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + Math.floor(ttlSeconds);

  const session: StaffSession = {
    staffId: payload.staffId,
    username: payload.username,
    role: payload.role,
    iat,
    exp,
  };

  const payloadB64 = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url"
  );
  const sigB64 = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token and checks expiration.
 * Returns `null` on tampered, malformed, or expired tokens.
 */
export function verifySessionToken(token: string): StaffSession | null {
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return null;
  }

  const secret = getSessionSecret();
  const expectedSigB64 = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  const providedSigBuf = Buffer.from(sigB64, "utf8");
  const expectedSigBuf = Buffer.from(expectedSigB64, "utf8");

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.staffId !== "string" ||
    record.staffId.length === 0 ||
    typeof record.username !== "string" ||
    record.username.length === 0 ||
    !isStaffRole(record.role) ||
    typeof record.iat !== "number" ||
    !Number.isFinite(record.iat) ||
    typeof record.exp !== "number" ||
    !Number.isFinite(record.exp)
  ) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (record.exp <= nowSeconds) {
    return null;
  }

  return {
    staffId: record.staffId,
    username: record.username,
    role: record.role,
    iat: record.iat,
    exp: record.exp,
  };
}
