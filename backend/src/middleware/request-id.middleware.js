import { randomUUID } from "node:crypto";

// Accept an ID from a trusted upstream (e.g. the frontend proxy) so one request can be traced
// across services, but only if it looks like an ID; otherwise clients could inject junk into logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requestId(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
