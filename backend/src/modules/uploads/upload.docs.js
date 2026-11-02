import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });
const error = (/** @type {string} */ description) => ({ description, content: json(ErrorResponse) });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerUploadDocs(registry) {
  registry.registerPath({
    method: "post",
    path: "/api/v1/uploads",
    tags: ["Uploads"],
    summary:
      "Upload one photo (multipart field `file`, max 15 MB). Returns a URL to put in a listing's `images`",
    description:
      "The photo is rotated upright, stripped of metadata (including GPS) and stored as WebP at 480, 960 and 1600 px. Append `-480.webp`, `-960.webp` or `-1600.webp` to the URL for each size. Limit: 80 uploads per user per hour.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: {
          "multipart/form-data": { schema: z.object({ file: z.string().meta({ format: "binary" }) }) },
        },
      },
    },
    responses: {
      201: { description: "Stored", content: json(z.object({ data: z.object({ url: z.string() }) })) },
      400: error("Missing file or not an image"),
      401: error("Not logged in"),
      403: error("Not from the web app"),
      413: error("Larger than 15 MB"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/media/{file}",
    tags: ["Uploads"],
    summary: "A locally stored photo size (development). In production photos are served from S3/CloudFront",
    request: { params: z.object({ file: z.string().meta({ example: "<uuid>-960.webp" }) }) },
    responses: { 200: { description: "WebP image, cacheable forever" }, 404: error("Not found") },
  });
}
