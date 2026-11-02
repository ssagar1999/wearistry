import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toApiError } from "../../src/middleware/error.middleware.js";
import { ApiError, ErrorCode } from "../../src/utils/api-error.js";

describe("toApiError", () => {
  it("passes ApiErrors through unchanged", () => {
    const original = ApiError.forbidden();
    expect(toApiError(original)).toBe(original);
  });

  it("turns Zod errors into 400s that name each invalid field", () => {
    const result = z.object({ email: z.email(), age: z.number() }).safeParse({ email: "x" });
    const apiError = toApiError(result.error);
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(apiError.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "email" }),
        expect.objectContaining({ path: "age" }),
      ]),
    );
  });

  it("maps malformed and oversized JSON bodies", () => {
    expect(toApiError(Object.assign(new Error("x"), { type: "entity.parse.failed" })).code).toBe(
      ErrorCode.INVALID_JSON,
    );
    expect(toApiError(Object.assign(new Error("x"), { type: "entity.too.large" })).status).toBe(413);
  });

  it("maps MongoDB duplicate keys to 409 with field names but not values", () => {
    const duplicate = Object.assign(new Error("E11000 dup key: { phone: '9876543210' }"), {
      code: 11000,
      keyPattern: { phone: 1 },
      keyValue: { phone: "9876543210" },
    });
    const apiError = toApiError(duplicate);
    expect(apiError.status).toBe(409);
    expect(apiError.details).toEqual({ fields: ["phone"] });
    expect(JSON.stringify(apiError)).not.toContain("9876543210");
  });

  it("maps Mongoose cast errors (e.g. a malformed ObjectId) to 400", () => {
    const cast = new mongoose.Error.CastError("ObjectId", "not-an-id", "_id");
    expect(toApiError(cast).status).toBe(400);
  });

  it("hides unexpected errors behind a generic 500", () => {
    const apiError = toApiError(new Error("connection string mongodb://admin:hunter2@db leaked"));
    expect(apiError.status).toBe(500);
    expect(apiError.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(apiError.message).not.toContain("hunter2");
  });

  it("treats thrown non-Error values as internal errors", () => {
    expect(toApiError("boom").status).toBe(500);
    expect(toApiError(null).status).toBe(500);
  });
});
