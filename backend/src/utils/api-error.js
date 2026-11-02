/**
 * Stable, machine-readable error codes. Clients branch on these, so never rename one;
 * add a new code instead.
 */
export const ErrorCode = Object.freeze({
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_JSON: "INVALID_JSON",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

/** @typedef {typeof ErrorCode[keyof typeof ErrorCode]} ErrorCodeValue */

/**
 * An error that is safe to show to the client: its message and details are written for API users.
 * Anything that is not an ApiError is treated as an unexpected bug and hidden behind a generic 500.
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {ErrorCodeValue} code
   * @param {string} message
   * @param {unknown} [details] Extra, client-safe information (e.g. which fields are invalid)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** @param {string} message @param {unknown} [details] */
  static badRequest(message, details) {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message = "Please log in to continue.") {
    return new ApiError(401, ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = "You don't have permission to do that.") {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = "Not found.") {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  /** @param {string} message @param {unknown} [details] */
  static conflict(message, details) {
    return new ApiError(409, ErrorCode.CONFLICT, message, details);
  }

  static tooManyRequests(message = "Too many requests. Please slow down and try again shortly.") {
    return new ApiError(429, ErrorCode.RATE_LIMITED, message);
  }
}
