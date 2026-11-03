import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registerAuthDocs } from "../modules/auth/auth.docs.js";
import { registerHealthDocs } from "../modules/health/health.docs.js";
import { registerProductDocs } from "../modules/products/product.docs.js";
import { registerSwapDocs } from "../modules/swaps/swap.docs.js";
import { registerThreadDocs } from "../modules/threads/thread.docs.js";
import { registerUploadDocs } from "../modules/uploads/upload.docs.js";
import { registerUserDocs } from "../modules/users/user.docs.js";

/**
 * Builds the OpenAPI document from the same Zod schemas used for validation, so the docs describe
 * what the API actually accepts. Each module registers only endpoints that exist.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registerHealthDocs(registry);
  registerAuthDocs(registry);
  registerUserDocs(registry);
  registerProductDocs(registry);
  registerUploadDocs(registry);
  registerThreadDocs(registry);
  registerSwapDocs(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Wearistry API",
      version: "0.1.0",
      description: "REST API for Wearistry, India's pre-loved fashion marketplace.",
    },
  });
}
