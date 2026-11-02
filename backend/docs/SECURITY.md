# Security

Each item is marked as either **Implemented** (it exists in the code and is tested) or **Planned** (it isn't built yet).

## Authentication: Planned (milestone 2)

The agreed design (not implemented yet):

- **Sign in with Google** (OAuth 2.0 / OpenID Connect) using `openid-client`, a certified library. It uses the Authorization Code flow with **PKCE**, plus `state` and `nonce` checks and ID-token validation. We never hand-write OAuth crypto.
- **Phone OTP** (moved from the frontend) as a second login option. A verified phone number is required before selling.
- **Sessions:** after login, the API creates a random, opaque session ID and stores the session in MongoDB with an automatic expiry (TTL index). That makes sessions revocable on logout or theft.
- **The session cookie is `httpOnly`, `Secure` in production, `SameSite=Lax` and `Path=/`.** JavaScript can't read it, and it isn't sent on cross-site POSTs.
- **No passwords are stored:** Google and OTP logins have none, so there's nothing to hash. If email-and-password login is ever added, use **argon2id**.

## Authorization: Planned (milestone 2)

- **A `requireUser` middleware** rejects anonymous requests with `401 UNAUTHENTICATED`.
- **Ownership checks live in services**, not routes. For example, only a listing's seller can edit it, and anyone else gets `403 FORBIDDEN`.
- **Authentication and authorization are reviewed separately:** being logged in never implies being allowed.

## CSRF: Planned (milestone 2)

Cookie-based auth needs CSRF protection. The plan has two layers:

1. **The `SameSite=Lax` cookie** isn't sent on cross-site `POST`, `PATCH` or `DELETE` requests.
2. **An `Origin` header check** on every state-changing request: it must match `CORS_ORIGINS`.

Together these cover modern browsers without CSRF tokens.

## Environment secrets: Implemented

- **Secrets live only in environment variables** (`.env` locally, the host's secret settings in production). They are never in code.
- **`.env` is git-ignored.** Only `.env.example`, which has no real values, is committed.
- **Startup validation never prints values,** only which variables are wrong (`src/config/env.js`, with a test).
- **Rotate a credential immediately** if it ever appears in a chat, a ticket, a log or a commit.

## CORS: Implemented

- **Only origins listed in `CORS_ORIGINS`** get `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`.
- **Other origins get no CORS headers,** so the browser blocks them from reading responses.
- **Requests without an `Origin` header** (server-to-server, curl, health checks) aren't subject to CORS and are allowed.
- **Never use `*` with credentials,** and never reflect arbitrary origins.

## Rate limiting: Implemented

- **Every `/api/v1` route is limited per IP:** `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` (default 120 per minute). Over the limit, it returns `429 RATE_LIMITED` with standard `RateLimit` headers.
- **`TRUST_PROXY_HOPS`** must equal the number of proxies in front of the API, so the real client IP is used. Setting it too high lets clients fake their IP with `X-Forwarded-For`.
- **Counters are in memory, per instance.** Running several instances needs a shared store (Redis) so the limits apply across all of them.
- **Planned:** stricter per-route limits for login and OTP endpoints (milestone 2).

## Request size limits: Implemented

JSON bodies are capped at **100 KB**, and larger ones get `413 PAYLOAD_TOO_LARGE`. **Planned:** photo uploads get their own limit (15 MB, milestone 3).

## Input validation and NoSQL injection: Implemented

- **All client input is parsed with Zod** in the `validate` middleware. Handlers read only `req.validated`.
- **Use `.strict()` object schemas,** so unknown fields and operator objects like `{ "$ne": null }` are rejected (tested).
- **Mongoose adds two more defences:** `sanitizeFilter: true` and `strictQuery: true` (see `DATABASE.md`).
- **Never build queries from raw `req.body` or `req.query`.**

## Security headers: Implemented

Helmet sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy` and others. `X-Powered-By` is removed (tested).

## Safe errors and logging: Implemented

- **Clients only ever see an `ApiError` message.** Anything unexpected becomes a generic `500 INTERNAL_ERROR`, with no stack traces, queries or driver messages (tested).
- **Duplicate-key errors** reveal field names, never values (tested).
- **Logs redact** `Cookie`, `Authorization` and `Set-Cookie` headers and any `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `idToken` or `otp` fields (`src/config/logger.js`). Request logs include only the ID, method, URL and IP.
- **Never log** request bodies, OTP codes or full user records.

## Common vulnerabilities: checklist for every change

| Risk                    | Rule                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection               | Validate with strict Zod schemas. Never pass raw input to queries                                                                                 |
| Broken access control   | Check ownership in the service for every read and write of user-owned data                                                                        |
| Mass assignment         | Copy only allowed fields from `req.validated` into updates. Never spread the whole body into a document                                           |
| Sensitive data exposure | Use projections. Never return sessions, tokens, phone numbers of other users or internal IDs that aren't needed                                   |
| Missing rate limits     | Brute-forceable endpoints (login, OTP) get stricter limits                                                                                        |
| SSRF                    | Never fetch a URL supplied by the client                                                                                                          |
| Dependency risk         | Run `npm audit --omit=dev` before releases. Keep the lockfile committed. Install scripts are denied by default (`allowScripts` in `package.json`) |
