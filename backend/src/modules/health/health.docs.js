import { z } from "zod";
import { rateLimitedResponse } from "../../docs/common.js";

const Liveness = z
  .object({ status: z.literal("ok"), uptimeSeconds: z.number().int() })
  .meta({ id: "Liveness" });

const Readiness = z
  .object({
    status: z.enum(["ok", "unavailable"]),
    checks: z.object({ database: z.enum(["up", "down"]) }),
  })
  .meta({ id: "Readiness" });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerHealthDocs(registry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/health/live",
    tags: ["Health"],
    summary: "Liveness: the process is running",
    responses: {
      200: {
        description: "Alive",
        content: { "application/json": { schema: z.object({ data: Liveness }) } },
      },
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/health/ready",
    tags: ["Health"],
    summary: "Readiness: the instance can serve traffic (database connected)",
    responses: {
      200: {
        description: "Ready",
        content: { "application/json": { schema: z.object({ data: Readiness }) } },
      },
      503: {
        description: "Not ready (database down)",
        content: { "application/json": { schema: z.object({ data: Readiness }) } },
      },
      429: rateLimitedResponse,
    },
  });
}
