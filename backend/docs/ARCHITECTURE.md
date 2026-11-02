# Architecture

The Wearistry API is a **modular monolith**: one Express process, organised into self-contained feature modules. It is the backend for the Next.js app in `../frontend`.

> **Status (milestone 2):** the foundation, plus the `auth` module (phone OTP, Google sign-in, sessions) and the `users` module (profile). The web app uses this API for all login and account features through its `/api/v1` proxy. Listings, uploads and threads still run in the web app's own Next.js API routes until milestone 3.

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
│   │   ├── database.js    Mongoose settings, connect/disconnect, index creation
│   │   └── migrations.js  Versioned migration runner (used by `npm run migrate`)
│   ├── middleware/      Cross-cutting Express middleware
│   │   ├── auth.middleware.js         loadSession (req.user) and requireUser (401)
│   │   ├── trusted-origin.middleware.js  Origin check for state-changing requests (CSRF)
│   │   ├── request-id.middleware.js   Assigns/propagates X-Request-Id
│   │   ├── rate-limit.middleware.js   Per-IP limits (express-rate-limit)
│   │   ├── validate.middleware.js     Zod validation → req.validated
│   │   ├── not-found.middleware.js    404 for unknown routes
│   │   └── error.middleware.js        Central error → response mapping
│   ├── modules/         One folder per feature
│   │   ├── health/        Liveness and readiness checks (the simplest reference module)
│   │   ├── auth/          OTP, Google sign-in, sessions: models, services, controller, routes, docs
│   │   └── users/         User model, user service (shared by auth), profile endpoint
│   ├── docs/            OpenAPI document built from module docs + shared schemas
│   ├── types/           Type declarations (adds req.id and req.validated to Express)
│   ├── utils/
│   │   └── api-error.js   ApiError class and stable error codes
│   ├── app.js           Builds the Express app (no network); used by server.js and tests
│   └── server.js        Process entry: env → logger → DB → HTTP server → graceful shutdown
├── migrations/          Versioned schema migrations (see MIGRATIONS.md)
├── scripts/             CLI helpers: migrate.js, test-sms.js
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
      → /health          (mounted before the checks below; no session needed)
      → trusted origin   POST/PATCH/PUT/DELETE must come from APP_URL / CORS_ORIGINS (403)
      → loadSession      cookie → req.user (2 indexed reads), anonymous if none
      → module router    e.g. /auth, /users  (requireUser → 401 where needed)
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

## How the frontend connects

```
Browser ──► Next.js (APP_URL, e.g. localhost:3000)
              │  /api/v1/*  is proxied (next.config.ts rewrites) ──► Express API (localhost:4000)
              │  server-rendered pages call API_INTERNAL_URL directly, forwarding the cookie
```

- **The browser only talks to the web app's origin.** The `wearistry_sid` cookie is first-party, no CORS is involved, and Google redirects back to our own domain (`APP_URL/api/v1/auth/google/callback`), which the proxy forwards to the API.
- **Server-rendered pages** (e.g. the header and `/account`) call `GET /api/v1/auth/me` on `API_INTERNAL_URL`, passing the browser's cookie (`frontend/src/lib/session.ts`). The web app never reads or creates sessions itself.
- **The proxy forwards `Origin` and `Cookie` and adds `X-Forwarded-For`,** so set `TRUST_PROXY_HOPS=1` for this setup.

## Key decisions

| Decision                                                                      | Why                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| JavaScript (ESM) with JSDoc types checked by `tsc --noEmit` (strict)          | Plain JS with no build step, but real type errors caught before running                   |
| Express 5                                                                     | Stable; async errors reach the error handler automatically                                |
| `createApp()` separate from `server.js`                                       | Tests run the real app with Supertest without opening a port or connecting at import time |
| Config passed in (`createApp({ env, logger })`) rather than read from globals | Tests can build apps with different settings (e.g. a tiny rate limit) side by side        |
| OpenAPI generated from Zod schemas                                            | Docs and validation share one source of truth                                             |
| No example business module                                                    | Avoids fake features; `health` demonstrates the pattern with real code                    |
