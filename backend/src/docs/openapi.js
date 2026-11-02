import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registerHealthDocs } from "../modules/health/health.docs.js";

/**
 * Builds the OpenAPI document from the same Zod schemas used for validation, so the docs describe
 * what the API actually accepts. Each module registers only endpoints that exist.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registerHealthDocs(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Wearistry API",
      version: "0.1.0",
      description: "REST API for Wearistry, India's pre-loved fashion marketplace.",
    },
  });
}
