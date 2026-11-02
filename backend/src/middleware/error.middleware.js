import mongoose from "mongoose";
import { ZodError } from "zod";
import { ApiError, ErrorCode } from "../utils/api-error.js";

const MONGO_DUPLICATE_KEY = 11000;

/**
 * Converts any thrown error into a client-safe ApiError. Known error types get a precise status;
 * everything else becomes a generic 500 so internal details (stack traces, queries, driver messages)
 * never reach the client.
 *
 * @param {unknown} error
 * @returns {ApiError}
 */
export function toApiError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.badRequest(
      "Some fields are missing or invalid.",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }

  if (isErrorLike(error)) {
    // Thrown by express.json() for malformed or oversized bodies.
    if (error.type === "entity.parse.failed") {
      return new ApiError(400, ErrorCode.INVALID_JSON, "The request body is not valid JSON.");
    }
    if (error.type === "entity.too.large") {
      return new ApiError(413, ErrorCode.PAYLOAD_TOO_LARGE, "The request body is too large.");
    }
    // Thrown by multer while reading a multipart upload.
    if (error.name === "MulterError") {
      if (error.code === "LIMIT_FILE_SIZE") {
        return new ApiError(413, ErrorCode.PAYLOAD_TOO_LARGE, "That photo is larger than 15 MB.");
      }
      return ApiError.badRequest('Upload one photo at a time in the "file" field.');
    }
    if (error.code === MONGO_DUPLICATE_KEY) {
      // Only field names are exposed, never the duplicated values.
      const fields = "keyPattern" in error && error.keyPattern ? Object.keys(error.keyPattern) : [];
      return ApiError.conflict("This already exists.", fields.length ? { fields } : undefined);
    }
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${error.path}".`);
  }

  return new ApiError(500, ErrorCode.INTERNAL_ERROR, "Something went wrong on our side. Please try again.");
}

/**
 * @param {unknown} error
 * @returns {error is Error & { type?: string, code?: unknown, keyPattern?: Record<string, unknown> }}
 */
function isErrorLike(error) {
  return typeof error === "object" && error !== null;
}

/** @type {import("express").ErrorRequestHandler} */
export function errorHandler(error, req, res, next) {
  // Once a response has started streaming it can't be replaced; Express's default handler closes it.
  if (res.headersSent) return next(error);

  const apiError = toApiError(error);
  if (apiError.status >= 500) {
    req.log.error({ err: error }, "Unhandled error");
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined && { details: apiError.details }),
      requestId: req.id,
    },
  });
}
