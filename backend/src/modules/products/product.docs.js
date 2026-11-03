import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import {
  createProductBody,
  listMyProductsQuery,
  listProductsQuery,
  PublicProduct,
  updateProductBody,
} from "./product.schemas.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });
const error = (/** @type {string} */ description) => ({ description, content: json(ErrorResponse) });
const listMeta = z.object({ nextCursor: z.string().nullable(), limit: z.number() });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerProductDocs(registry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/products",
    tags: ["Products"],
    summary: "Browse active listings, newest first (cursor-paginated), or fetch specific ones by `ids`",
    request: { query: listProductsQuery },
    responses: {
      200: {
        description: "A page of listings",
        content: json(z.object({ data: z.array(PublicProduct), meta: listMeta })),
      },
      400: error("Invalid filter or cursor"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/products/{id}",
    tags: ["Products"],
    summary: "One listing",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: "The listing", content: json(z.object({ data: PublicProduct })) },
      404: error("Not found"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/products",
    tags: ["Products"],
    summary: "Create a listing (photos uploaded first via POST /api/v1/uploads)",
    security: [{ sessionCookie: [] }],
    request: { body: { content: json(createProductBody) } },
    responses: {
      201: { description: "Created", content: json(z.object({ data: PublicProduct })) },
      400: error("Invalid input or photos not uploaded to Wearistry"),
      401: error("Not logged in"),
      403: error("No verified phone or name, or not from the web app"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/products/mine",
    tags: ["Products"],
    summary: "Your own listings, newest first, including sold and swapped ones (not removed)",
    security: [{ sessionCookie: [] }],
    request: { query: listMyProductsQuery },
    responses: {
      200: {
        description: "A page of your listings",
        content: json(z.object({ data: z.array(PublicProduct), meta: listMeta })),
      },
      401: error("Not logged in"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/v1/products/{id}",
    tags: ["Products"],
    summary:
      "Change your own listing (any of: title, category, size, condition, city, price, mrp, story, exchange, status)",
    description: "`status` can be `active`, `sold` or `swapped`. Photos can't be changed yet.",
    security: [{ sessionCookie: [] }],
    request: { params: z.object({ id: z.string() }), body: { content: json(updateProductBody) } },
    responses: {
      200: { description: "Updated", content: json(z.object({ data: PublicProduct })) },
      400: error("Invalid input"),
      401: error("Not logged in"),
      403: error("Not your listing, or not from the web app"),
      404: error("Not found or removed"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v1/products/{id}",
    tags: ["Products"],
    summary: "Remove your listing (soft delete: hidden everywhere, nothing erased)",
    security: [{ sessionCookie: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      204: { description: "Removed" },
      401: error("Not logged in"),
      403: error("Not your listing, or not from the web app"),
      404: error("Not found or already removed"),
      429: rateLimitedResponse,
    },
  });
}
