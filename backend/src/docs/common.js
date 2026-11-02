import { z } from "zod";
import { ErrorCode } from "../utils/api-error.js";

/** The single error shape every endpoint returns (see docs/API_CONVENTIONS.md). */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.enum(Object.values(ErrorCode)),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .meta({ id: "ErrorResponse" });

/** Every /api/v1 route can return this when the per-IP rate limit is exceeded. */
export const rateLimitedResponse = {
  description: "Too many requests (RATE_LIMITED)",
  content: { "application/json": { schema: ErrorResponse } },
};
