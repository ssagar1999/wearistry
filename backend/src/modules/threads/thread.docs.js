import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import {
  createReplyBody,
  createThreadBody,
  listRepliesQuery,
  listThreadsQuery,
  PublicReply,
  PublicThread,
} from "./thread.schemas.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });
const error = (/** @type {string} */ description) => ({ description, content: json(ErrorResponse) });
const listMeta = z.object({ nextCursor: z.string().nullable(), limit: z.number() });
const id = z.object({ id: z.string() });
const likeState = z.object({ data: z.object({ likes: z.number(), liked: z.boolean() }) });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerThreadDocs(registry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/threads",
    tags: ["Threads"],
    summary: "The community feed, newest first (cursor-paginated). `liked` reflects the logged-in viewer",
    request: { query: listThreadsQuery },
    responses: {
      200: {
        description: "A page of threads",
        content: json(z.object({ data: z.array(PublicThread), meta: listMeta })),
      },
      400: error("Invalid cursor"),
      429: rateLimitedResponse,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/threads",
    tags: ["Threads"],
    summary: "Post a thread",
    security: [{ sessionCookie: [] }],
    request: { body: { content: json(createThreadBody) } },
    responses: {
      201: { description: "Created", content: json(z.object({ data: PublicThread })) },
      400: error("Invalid input or unknown listing"),
      401: error("Not logged in"),
      403: error("No profile name, or not from the web app"),
      429: rateLimitedResponse,
    },
  });
  for (const method of /** @type {const} */ (["post", "delete"])) {
    registry.registerPath({
      method,
      path: "/api/v1/threads/{id}/like",
      tags: ["Threads"],
      summary: method === "post" ? "Like (idempotent)" : "Remove your like (idempotent)",
      security: [{ sessionCookie: [] }],
      request: { params: id },
      responses: {
        200: { description: "Current count and your state", content: json(likeState) },
        401: error("Not logged in"),
        403: error("Not from the web app"),
        404: error("Thread not found"),
        429: rateLimitedResponse,
      },
    });
  }
  registry.registerPath({
    method: "get",
    path: "/api/v1/threads/{id}/replies",
    tags: ["Threads"],
    summary: "Replies, oldest first (cursor-paginated)",
    request: { params: id, query: listRepliesQuery },
    responses: {
      200: {
        description: "A page of replies",
        content: json(z.object({ data: z.array(PublicReply), meta: listMeta })),
      },
      404: error("Thread not found"),
      429: rateLimitedResponse,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/threads/{id}/replies",
    tags: ["Threads"],
    summary: "Reply to a thread",
    security: [{ sessionCookie: [] }],
    request: { params: id, body: { content: json(createReplyBody) } },
    responses: {
      201: { description: "Created", content: json(z.object({ data: PublicReply })) },
      400: error("Invalid input"),
      401: error("Not logged in"),
      403: error("No profile name, or not from the web app"),
      404: error("Thread not found"),
      429: rateLimitedResponse,
    },
  });
}
