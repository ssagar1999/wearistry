import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of randomness, URL-safe. Used for session tokens. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** Unkeyed hash for values that are already unguessable (session tokens). */
export const sha256 = (/** @type {string} */ value) => createHash("sha256").update(value).digest("hex");

/**
 * Keyed hash for values an attacker could brute-force if they saw the hash (6-digit OTP codes).
 *
 * @param {string} secret
 * @param {string} value
 */
export const hmac = (secret, value) => createHmac("sha256", secret).update(value).digest("hex");

/** Constant-time comparison, so response timing doesn't leak how much of a hash matched. */
export function safeEqual(/** @type {string} */ a, /** @type {string} */ b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
