import { ApiError } from "../utils/api-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for cookie-authenticated requests. Browsers always send `Origin` on cross-site and
 * same-site POST/PATCH/PUT/DELETE requests and pages can't forge it, so a state-changing request is
 * accepted only from our own web app's origin. Works together with the SameSite=Lax session cookie.
 *
 * @param {string[]} allowedOrigins
 * @returns {import("express").RequestHandler}
 */
export function requireTrustedOrigin(allowedOrigins) {
  const allowed = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin") ?? originOf(req.get("referer"));
    if (!origin || !allowed.has(origin)) throw ApiError.forbidden("This request didn't come from Wearistry.");
    next();
  };
}

/** @param {string | undefined} url */
function originOf(url) {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined; // a malformed Referer is treated the same as a missing one
  }
}
