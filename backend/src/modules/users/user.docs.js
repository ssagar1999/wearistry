import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import { PublicProfile, PublicUser, publicProfileParams, updateProfileBody } from "./user.schemas.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerUserDocs(registry) {
  registry.registerPath({
    method: "patch",
    path: "/api/v1/users/me",
    tags: ["Users"],
    summary: "Update your name and city",
    security: [{ sessionCookie: [] }],
    request: { body: { content: json(updateProfileBody) } },
    responses: {
      200: { description: "Updated", content: json(z.object({ data: z.object({ user: PublicUser }) })) },
      400: { description: "Invalid input", content: json(ErrorResponse) },
      401: { description: "Not logged in", content: json(ErrorResponse) },
      403: { description: "Request not from the Wearistry web app", content: json(ErrorResponse) },
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/users/{id}",
    tags: ["Users"],
    summary: "A seller's public profile (no phone or email)",
    request: { params: publicProfileParams },
    responses: {
      200: { description: "The profile", content: json(z.object({ data: PublicProfile })) },
      400: { description: "Malformed ID", content: json(ErrorResponse) },
      404: { description: "No such seller", content: json(ErrorResponse) },
      429: rateLimitedResponse,
    },
  });
}
