import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./docs/openapi.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFound } from "./middleware/not-found.middleware.js";
import { createRateLimiter } from "./middleware/rate-limit.middleware.js";
import { requestId } from "./middleware/request-id.middleware.js";
import { healthRouter } from "./modules/health/health.routes.js";

/** @typedef {import("./config/env.js").Env} Env */

const JSON_BODY_LIMIT = "100kb";

/**
 * Builds the Express app without starting a server, so tests can exercise it with Supertest.
 * Middleware order matters: tracing first, then security, then parsing, routes, and errors last.
 *
 * @param {{ env: Readonly<Env>, logger: import("pino").Logger }} deps
 */
export function createApp({ env, logger }) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => /** @type {import("express").Request} */ (req).id,
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      // One short line per request: enough to trace and debug, without dumping every header.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      // Health checks hit every few seconds; logging them would drown out real traffic.
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      // Only listed browser origins may call the API with credentials. Requests without an Origin
      // header (server-to-server, curl, health checks) aren't subject to CORS and are allowed.
      origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const api = express.Router();
  api.use(createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }));
  api.use("/health", healthRouter);
  app.use("/api/v1", api);

  if (env.NODE_ENV !== "production") {
    const openApiDocument = buildOpenApiDocument();
    app.get("/api/docs.json", (_req, res) => res.json(openApiDocument));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
