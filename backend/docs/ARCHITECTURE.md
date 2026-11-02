# Architecture

The Wearistry API is a **modular monolith**: one Express process, organised into self-contained feature modules. It is the backend for the Next.js app in `../frontend`.

> **Status (milestone 1):** the foundation exists: configuration, logging, database connection, middleware, error handling, health checks, API docs and tests. Feature modules (auth, products, uploads, threads) are planned for milestones 2–3 and are **not implemented yet**. Today the frontend still uses its own Next.js API routes.

## Why a modular monolith

- **One deployable unit:** simple to run, debug and deploy, which suits a small team.
- **Clear module boundaries:** each feature owns its routes, validation, logic and data. A module can be split into its own service later if it ever needs to scale independently, without untangling shared code first.

## Folder structure

```
backend/
├── src/
│   ├── config/          Startup configuration (no Express here)
│   │   ├── env.js         Validates environment variables with Zod; fails fast on bad config
│   │   ├── logger.js      Pino logger with secret redaction
│   │   └── database.js    Mongoose settings, connect/disconnect, index creation
│   ├── middleware/      Cross-cutting Express middleware
│   │   ├── request-id.middleware.js   Assigns/propagates X-Request-Id
│   │   ├── rate-limit.middleware.js   Per-IP limits (express-rate-limit)
│   │   ├── validate.middleware.js     Zod validation → req.validated
│   │   ├── not-found.middleware.js    404 for unknown routes
│   │   └── error.middleware.js        Central error → response mapping
│   ├── modules/         One folder per feature
│   │   └── health/        Liveness and readiness checks (the reference module)
│   ├── docs/            OpenAPI document built from module docs + shared schemas
│   ├── types/           Type declarations (adds req.id and req.validated to Express)
│   ├── utils/
│   │   └── api-error.js   ApiError class and stable error codes
│   ├── app.js           Builds the Express app (no network); used by server.js and tests
│   └── server.js        Process entry: env → logger → DB → HTTP server → graceful shutdown
├── tests/
│   ├── unit/            Pure functions and middleware in isolation
│   ├── integration/     HTTP requests through the real app against an in-memory MongoDB
│   └── helpers/         Test app builder and the in-memory MongoDB setup
└── docs/                These documents
```

## Anatomy of a module

The `health` module is the reference. A feature module adds files as it needs them:

| File              | Responsibility                                                                                                  | Must not                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `*.routes.js`     | Declares endpoints and attaches middleware (`validate`, auth)                                                   | Contain logic                             |
| `*.controller.js` | Reads `req.validated`, calls the service, sends the status and response                                         | Query the database or hold business rules |
| `*.service.js`    | Business rules and orchestration; plain inputs and outputs                                                      | Touch `req`/`res`                         |
| `*.model.js`      | Mongoose schema, indexes, timestamps                                                                            | Contain unrelated business logic          |
| `*.repository.js` | Complex queries (e.g. cursor pagination). **Only when needed**; simple CRUD can call the model from the service | Hold business rules                       |
| `*.schemas.js`    | Zod schemas for params, query and body                                                                          | Contain anything else                     |
| `*.docs.js`       | Registers the module's endpoints in OpenAPI                                                                     | Document endpoints that don't exist       |

## Request flow

```
HTTP request
  → requestId            assigns req.id, echoes X-Request-Id
  → pino-http            one log line per request (health checks skipped)
  → helmet               security headers
  → cors                 allow-list of browser origins, credentials allowed
  → express.json         parses JSON, max 100 KB
  → /api/v1 router
      → rate limiter     per-IP limit (429 RATE_LIMITED)
      → module router    e.g. /health
          → validate     Zod-parsed input on req.validated (400 on failure)
          → controller → service → (repository) → Mongoose model → MongoDB
  → notFound             unknown route → 404
  → errorHandler         any thrown error → { error: { code, message, details?, requestId } }
```

Express 5 forwards errors thrown in `async` handlers to `errorHandler` automatically, so handlers simply `throw` and no `asyncHandler` wrapper is needed.

## Startup and shutdown (`server.js`)

1. **Validate the environment.** Invalid or missing values print every problem and exit with code 1.
2. **Create the logger.**
3. **Connect to MongoDB and create any missing indexes.** If that fails, the process exits with code 1. It should never serve traffic without its database.
4. **Start the HTTP server.**
5. **On SIGTERM or SIGINT:** stop accepting connections, let in-flight requests finish, disconnect MongoDB, then exit 0. A 10-second timer forces exit 1 if shutdown hangs.
6. **On an unhandled rejection or uncaught exception:** log it as fatal and exit 1, so the process manager restarts a clean instance.

## How the frontend will connect (milestone 2)

This is planned, not implemented yet:

- The browser talks only to the Next.js app, which proxies `/api/v1/*` to this API. That keeps cookies first-party and avoids browser CORS.
- Server-rendered pages call the API directly over the internal network and forward the user's cookie.
- `CORS_ORIGINS` and `TRUST_PROXY_HOPS` are already supported for this setup.

## Key decisions

| Decision                                                                      | Why                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| JavaScript (ESM) with JSDoc types checked by `tsc --noEmit` (strict)          | Plain JS with no build step, but real type errors caught before running                   |
| Express 5                                                                     | Stable; async errors reach the error handler automatically                                |
| `createApp()` separate from `server.js`                                       | Tests run the real app with Supertest without opening a port or connecting at import time |
| Config passed in (`createApp({ env, logger })`) rather than read from globals | Tests can build apps with different settings (e.g. a tiny rate limit) side by side        |
| OpenAPI generated from Zod schemas                                            | Docs and validation share one source of truth                                             |
| No example business module                                                    | Avoids fake features; `health` demonstrates the pattern with real code                    |
