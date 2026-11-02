import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import { createProductBody, listProductsQuery, PublicProduct } from "./product.schemas.js";

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
}
