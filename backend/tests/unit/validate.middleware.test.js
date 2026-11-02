import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { validate } from "../../src/middleware/validate.middleware.js";

/** @param {Partial<import("express").Request>} parts */
const fakeRequest = (parts) => /** @type {import("express").Request} */ (/** @type {unknown} */ (parts));
const noResponse = /** @type {import("express").Response} */ (/** @type {unknown} */ ({}));

describe("validate middleware", () => {
  const middleware = validate({
    body: z.object({ title: z.string().min(2) }).strict(),
    query: z.object({ limit: z.coerce.number().int().max(50).default(20) }),
  });

  it("stores parsed, type-converted input on req.validated", () => {
    const req = fakeRequest({ body: { title: "Kurta" }, query: { limit: "10" }, params: {} });
    const next = vi.fn();
    middleware(req, noResponse, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.validated).toEqual({ body: { title: "Kurta" }, query: { limit: 10 }, params: undefined });
  });

  it("applies schema defaults", () => {
    const req = fakeRequest({ body: { title: "Saree" }, query: {}, params: {} });
    middleware(req, noResponse, vi.fn());
    expect(req.validated?.query).toEqual({ limit: 20 });
  });

  it("throws a ZodError for invalid input so the error middleware returns 400", () => {
    const req = fakeRequest({ body: { title: "K" }, query: {}, params: {} });
    expect(() => middleware(req, noResponse, vi.fn())).toThrow(ZodError);
  });

  it("rejects unexpected fields and MongoDB operators in strict schemas", () => {
    const req = fakeRequest({ body: { title: "Kurta", price: { $gt: 0 } }, query: {}, params: {} });
    expect(() => middleware(req, noResponse, vi.fn())).toThrow(ZodError);
  });

  it("treats a missing body as an empty object", () => {
    const req = fakeRequest({ query: {}, params: {} });
    expect(() => middleware(req, noResponse, vi.fn())).toThrow(ZodError);
  });
});
