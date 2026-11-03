import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { createSwapBody, decideSwapBody, listSwapsQuery, swapParams } from "./swap.schemas.js";
import { createSwapRequest, decideSwapRequest, listSwapRequests } from "./swap.service.js";

/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */

/** @param {Request} req */
function currentUser(req) {
  if (!req.user) throw ApiError.unauthenticated();
  return req.user;
}

/** @param {Request} req @param {Response} res */
export async function create(req, res) {
  const body = validated(req, "body", createSwapBody);
  res.status(201).json({ data: await createSwapRequest(currentUser(req), body) });
}

/** @param {Request} req @param {Response} res */
export async function list(req, res) {
  const query = validated(req, "query", listSwapsQuery);
  const { items, nextCursor } = await listSwapRequests(currentUser(req).id, query);
  res.json({ data: items, meta: { nextCursor, limit: query.limit } });
}

/** @param {Request} req @param {Response} res */
export async function decide(req, res) {
  const { id } = validated(req, "params", swapParams);
  const { action } = validated(req, "body", decideSwapBody);
  res.json({ data: await decideSwapRequest(currentUser(req).id, id, action) });
}
