import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createReplyBody,
  createThreadBody,
  listRepliesQuery,
  listThreadsQuery,
  threadParams,
} from "./thread.schemas.js";
import {
  addReply,
  createThread,
  likeThread,
  listReplies,
  listThreads,
  unlikeThread,
} from "./thread.service.js";

/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */

/** @param {Request} req */
function currentUser(req) {
  if (!req.user) throw ApiError.unauthenticated();
  return req.user;
}

/** @param {Request} req @param {Response} res */
export async function list(req, res) {
  const query = validated(req, "query", listThreadsQuery);
  const { items, nextCursor } = await listThreads(query, req.user?.id);
  res.json({ data: items, meta: { nextCursor, limit: query.limit } });
}

/** @param {Request} req @param {Response} res */
export async function create(req, res) {
  const thread = await createThread(currentUser(req), validated(req, "body", createThreadBody));
  res.status(201).json({ data: thread });
}

/** @param {Request} req @param {Response} res */
export async function like(req, res) {
  const { id } = validated(req, "params", threadParams);
  res.json({ data: await likeThread(id, currentUser(req).id) });
}

/** @param {Request} req @param {Response} res */
export async function unlike(req, res) {
  const { id } = validated(req, "params", threadParams);
  res.json({ data: await unlikeThread(id, currentUser(req).id) });
}

/** @param {Request} req @param {Response} res */
export async function replies(req, res) {
  const { id } = validated(req, "params", threadParams);
  const query = validated(req, "query", listRepliesQuery);
  const { items, nextCursor } = await listReplies(id, query);
  res.json({ data: items, meta: { nextCursor, limit: query.limit } });
}

/** @param {Request} req @param {Response} res */
export async function reply(req, res) {
  const { id } = validated(req, "params", threadParams);
  const { text } = validated(req, "body", createReplyBody);
  res.status(201).json({ data: await addReply(id, currentUser(req), text) });
}
