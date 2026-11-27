import crypto from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 6;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function scryptAsync(
  password: string,
  salt: string,
  keylen: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Hashes a staff password using scrypt with a 16-byte random hex salt.
 * Produces `scrypt:<saltHex>:<hashHex>` matching `scripts/seed.ts`.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.trim().length === 0) {
    throw new Error("Password must not be empty.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    );
  }

  const saltHex = crypto.randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const derivedKey = await scryptAsync(password, saltHex, SCRYPT_KEY_LENGTH);

  return `${SCRYPT_PREFIX}:${saltHex}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt:<saltHex>:<hashHex>` hash
 * using constant-time buffer comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    typeof storedHash !== "string" ||
    storedHash.length === 0
  ) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const [, saltHex, hashHex] = parts;
  if (
    !saltHex ||
    !hashHex ||
    hashHex.length % 2 !== 0 ||
    !HEX_PATTERN.test(hashHex)
  ) {
    return false;
  }

  const expectedKey = Buffer.from(hashHex, "hex");
  if (expectedKey.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const derivedKey = await scryptAsync(password, saltHex, SCRYPT_KEY_LENGTH);
  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedKey);
}
