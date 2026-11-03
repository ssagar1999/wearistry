import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import { createSwapBody, decideSwapBody, listSwapsQuery, SwapRequestView } from "./swap.schemas.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });
const error = (/** @type {string} */ description) => ({ description, content: json(ErrorResponse) });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerSwapDocs(registry) {
  registry.registerPath({
    method: "post",
    path: "/api/v1/swap-requests",
    tags: ["Swaps"],
    summary: "Offer one of your pieces for a listing that's open to swaps",
    description:
      "Needs a verified phone. One pending request per person per listing. Limit: 20 per user per hour.",
    security: [{ sessionCookie: [] }],
    request: { body: { content: json(createSwapBody) } },
    responses: {
      201: { description: "Sent", content: json(z.object({ data: SwapRequestView })) },
      400: error("Invalid input, not open to swaps, or your own listing"),
      401: error("Not logged in"),
      403: error("No verified phone or name, or not from the web app"),
      404: error("Listing not available"),
      409: error("You already have a pending request for this piece"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/swap-requests",
    tags: ["Swaps"],
    summary: "Your swap requests: `box=received` (offers on your listings) or `box=sent`, newest first",
    security: [{ sessionCookie: [] }],
    request: { query: listSwapsQuery },
    responses: {
      200: {
        description: "A page of requests. `contactPhone` is filled only for accepted requests",
        content: json(
          z.object({
            data: z.array(SwapRequestView),
            meta: z.object({ nextCursor: z.string().nullable(), limit: z.number() }),
          }),
        ),
      },
      401: error("Not logged in"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/v1/swap-requests/{id}",
    tags: ["Swaps"],
    summary: "The owner accepts or declines; the requester cancels. Only pending requests can change",
    security: [{ sessionCookie: [] }],
    request: { params: z.object({ id: z.string() }), body: { content: json(decideSwapBody) } },
    responses: {
      200: {
        description: "Updated request (with the other person's phone if accepted)",
        content: json(z.object({ data: SwapRequestView })),
      },
      401: error("Not logged in"),
      403: error("Wrong party for this action, or not from the web app"),
      404: error("Not found, or you aren't part of it"),
      409: error("Already decided"),
      429: rateLimitedResponse,
    },
  });
}
