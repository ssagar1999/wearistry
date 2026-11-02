/**
 * Validates request input with Zod schemas and exposes the parsed result as `req.validated`.
 * Handlers must read from `req.validated`, never from `req.body` / `req.query` directly, so only
 * checked and type-converted data reaches services. (Express 5 makes `req.query` read-only, which is
 * another reason the parsed values live on their own property.)
 *
 * Validation failures are forwarded as ZodErrors and turned into 400 responses by the error middleware.
 *
 * @param {{ body?: import("zod").ZodType, query?: import("zod").ZodType, params?: import("zod").ZodType }} schemas
 * @returns {import("express").RequestHandler}
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}
