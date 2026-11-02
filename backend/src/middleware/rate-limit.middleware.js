import { rateLimit } from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

/**
 * Per-IP request limit. Uses in-memory counters, which is correct for a single API instance;
 * running several instances needs a shared store (e.g. Redis) so limits apply across all of them.
 *
 * @param {{ windowMs: number, limit: number }} options
 */
export function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
  });
}
