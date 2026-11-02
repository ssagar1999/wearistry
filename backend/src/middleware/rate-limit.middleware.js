import { rateLimit } from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

/**
 * Per-IP request limit. Uses in-memory counters, which is correct for a single API instance;
 * running several instances needs a shared store (e.g. Redis) so limits apply across all of them.
 *
 * @param {{ windowMs: number, limit: number, keyGenerator?: (req: import("express").Request) => string }} options
 *   `keyGenerator` limits by something other than IP (e.g. the logged-in user).
 */
export function createRateLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    ...(keyGenerator && { keyGenerator }),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
  });
}
