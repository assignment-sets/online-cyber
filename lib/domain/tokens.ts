import { randomInt } from "node:crypto";

/**
 * Unambiguous Crockford-like alphabet excluding 0, O, 1, and I.
 */
export const WORK_TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const WORK_TOKEN_PREFIX = "OC-";
export const WORK_TOKEN_CODE_LENGTH = 6;
export const WORK_TOKEN_REGEX = /^OC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * Generates a unique-format Work Token (e.g. "OC-7K9P3M") using cryptographic randomness.
 */
export function generateWorkToken(): string {
  let code = "";
  for (let i = 0; i < WORK_TOKEN_CODE_LENGTH; i += 1) {
    const index = randomInt(0, WORK_TOKEN_ALPHABET.length);
    code += WORK_TOKEN_ALPHABET[index];
  }
  return `${WORK_TOKEN_PREFIX}${code}`;
}

/**
 * Normalizes a customer-entered work token by trimming whitespace and uppercasing.
 */
export function normalizeWorkToken(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Checks whether a normalized token matches the expected OC-XXXXXX format.
 */
export function isValidWorkToken(token: string): boolean {
  return WORK_TOKEN_REGEX.test(token);
}
