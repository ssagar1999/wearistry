# API Conventions

These rules apply to every endpoint. The interactive reference is generated from the code at **`/api/docs`** (development and test only; disabled in production). It lists only endpoints that exist.

## Base path and versioning

- All endpoints live under **`/api/v1`**.
- A breaking change (removing or renaming a field, changing its meaning or status codes) needs a new version prefix (`/api/v2`). Adding optional fields or new endpoints is not breaking.

## Naming

- **Resources are plural nouns in kebab-case:** `/api/v1/products`, `/api/v1/swap-requests`.
- **Identify one item by path parameter:** `/api/v1/products/:id`.
- **Nest only for true ownership, at most one level deep:** `/api/v1/threads/:id/replies`.
- **Actions that aren't CRUD use a verb sub-resource, sparingly:** `POST /api/v1/threads/:id/like`.
- **JSON fields are camelCase:** `createdAt`, `sellerId`.

## HTTP methods

| Method   | Use                          | Body                              | Typical success                  |
| -------- | ---------------------------- | --------------------------------- | -------------------------------- |
| `GET`    | Read a resource or list      | none                              | `200`                            |
| `POST`   | Create, or perform an action | JSON                              | `201` (created) / `200` (action) |
| `PATCH`  | Partial update               | JSON with only the changed fields | `200`                            |
| `PUT`    | Full replace (rarely needed) | JSON                              | `200`                            |
| `DELETE` | Remove                       | none                              | `204`                            |

`GET` requests must never change data.

## Status codes

| Code | When                                   | Error `code`        |
| ---- | -------------------------------------- | ------------------- |
| 200  | Success with a body                    | none                |
| 201  | Created                                | none                |
| 204  | Success, no body                       | none                |
| 400  | Invalid input, invalid ID format       | `VALIDATION_ERROR`  |
| 400  | Body isn't valid JSON                  | `INVALID_JSON`      |
| 401  | Not logged in, or the session expired  | `UNAUTHENTICATED`   |
| 403  | Logged in but not allowed              | `FORBIDDEN`         |
| 404  | Resource or route doesn't exist        | `NOT_FOUND`         |
| 409  | Duplicate (unique field already taken) | `CONFLICT`          |
| 413  | JSON body over 100 KB                  | `PAYLOAD_TOO_LARGE` |
| 429  | Rate limit exceeded                    | `RATE_LIMITED`      |
| 500  | Unexpected server error                | `INTERNAL_ERROR`    |
| 503  | Dependency down (readiness check)      | none (see Health)   |

All codes in this table are defined in `src/utils/api-error.js` and produced by `src/middleware/error.middleware.js`. `401 UNAUTHENTICATED` is returned for a missing or expired session, and for a wrong or expired OTP code. `403 FORBIDDEN` is returned when a state-changing request doesn't come from the web app's origin. `409 CONFLICT` covers a phone already linked to another account. `503 SERVICE_UNAVAILABLE` means Google or SMS login isn't configured, or the SMS provider failed. Error codes are a contract with clients: **never rename one; add a new one.**

## Response format

**Success:**

```json
{ "data": { "status": "ok", "uptimeSeconds": 42 } }
```

**Lists add `meta`:**

```json
{ "data": [ ... ], "meta": { "nextCursor": "…", "limit": 20 } }
```

**Errors** always have this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are missing or invalid.",
    "details": [{ "path": "price", "message": "Too small: expected number to be >0" }],
    "requestId": "6bbfb1c2-0ebb-4755-bc5c-a3318678cdcf"
  }
}
```

- **`message`** is safe to show users. Internal errors always get a generic message.
- **`details`** is optional: field errors for validation, `{ fields: [...] }` for conflicts.
- **`requestId`** matches the `X-Request-Id` response header and the server logs. Ask users for it when debugging.

## Pagination

Every list uses **cursor pagination**, which stays fast and consistent while new items are added. Offset paging (`?page=40`) gets slower and skips or repeats items as data changes.

- **Request:** `GET /api/v1/products?limit=20&cursor=<opaque>`
- **Limits:** `limit` defaults to 20, maximum 50. No endpoint returns an unbounded list.
- **Next page:** the response's `meta.nextCursor` is passed back as `cursor`. When it's `null`, there are no more pages.
- **Cursors are opaque:** clients must not build or parse them. A tampered cursor gets `400`.
- **Exception:** `GET /api/v1/products?ids=a,b,c` (up to 50 IDs) returns exactly those listings, in that order, with `nextCursor: null`.

## Filtering and sorting

- **Filters are query parameters, validated by Zod:** `?city=Pune&category=Jackets`.
- **Only documented filters are accepted.** Unknown query parameters are rejected rather than passed to the database.

## Health endpoints

| Endpoint                   | Meaning                                | Responses                                                                                             |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Process is running                     | `200 { data: { status: "ok", uptimeSeconds } }`                                                       |
| `GET /api/v1/health/ready` | Can serve traffic (database connected) | `200 { data: { status: "ok", checks: { database: "up" } } }` or `503` with `"unavailable"` / `"down"` |

Readiness returns `503` with a `data` body, not an `error`, because "not ready" is an expected state that load balancers poll for.

## Authentication

- **Logged-in requests carry the `wearistry_sid` cookie** (httpOnly). Browsers send it automatically through the web app's `/api/v1` proxy.
- **State-changing requests** (POST, PATCH, PUT, DELETE) must include an `Origin` header matching the web app. Browsers do this automatically; scripts and tests must set it.
- **Browser-navigation endpoints** (`/auth/google/start`, `/auth/google/callback`) answer with `302` redirects, never JSON, including on errors (`/login?error=…`).
- **`429` responses for login codes** may include `details.retryAfterSeconds`.

| Method | Path                                       | Auth              | Purpose                                                                  |
| ------ | ------------------------------------------ | ----------------- | ------------------------------------------------------------------------ |
| POST   | `/api/v1/auth/otp/send`                    | none              | Send a login code `{ phone }`                                            |
| POST   | `/api/v1/auth/otp/verify`                  | none (or session) | Log in `{ phone, code }`. With a session, adds the phone to that account |
| GET    | `/api/v1/auth/google/start?returnTo=/path` | none              | Redirect to Google                                                       |
| GET    | `/api/v1/auth/google/callback`             | none              | Google returns here. Sets the session and redirects                      |
| GET    | `/api/v1/auth/me`                          | session           | The logged-in user                                                       |
| POST   | `/api/v1/auth/logout`                      | optional          | End this session (`204`)                                                 |
| PATCH  | `/api/v1/users/me`                         | session           | Update `{ name, city }`                                                  |

## Listings, uploads and threads

| Method        | Path                          | Auth                     | Purpose                                                                                                                              |
| ------------- | ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET           | `/api/v1/products`            | none                     | Active listings, newest first. Filters: `city`, `category`, `condition`, `exchange=true`, `q` (keywords), `sellerSlug`, or `ids=a,b` |
| GET           | `/api/v1/products/:id`        | none                     | One listing (by its slug ID)                                                                                                         |
| POST          | `/api/v1/products`            | session + verified phone | Create a listing. Photos must come from `POST /uploads`                                                                              |
| POST          | `/api/v1/uploads`             | session                  | One photo per request (`multipart/form-data`, field `file`, ≤ 15 MB) → `{ url }`                                                     |
| GET           | `/api/v1/media/:file`         | none                     | Locally stored photo sizes (development). Not rate-limited, cacheable forever                                                        |
| GET           | `/api/v1/threads`             | optional                 | The feed, newest first. `liked` reflects the viewer, `product` is a small listing card                                               |
| POST          | `/api/v1/threads`             | session + name           | Post `{ kind, text, productId? }`                                                                                                    |
| POST / DELETE | `/api/v1/threads/:id/like`    | session                  | Like or unlike. **Idempotent:** repeating has no extra effect. Returns `{ likes, liked }`                                            |
| GET           | `/api/v1/threads/:id/replies` | none                     | Replies, oldest first, cursor-paginated                                                                                              |
| POST          | `/api/v1/threads/:id/replies` | session + name           | Reply `{ text }`                                                                                                                     |

**Managing your listings, seller profiles and swaps:**

| Method | Path                                           | Auth                     | Purpose                                                                                                                                              |
| ------ | ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/products/mine`                        | session                  | Your listings (including sold and swapped, not removed), cursor-paginated                                                                            |
| PATCH  | `/api/v1/products/:id`                         | session, owner           | Change any of title, category, size, condition, city, price, mrp, story, exchange, status (`active`, `sold`, `swapped`). Photos can't be changed yet |
| DELETE | `/api/v1/products/:id`                         | session, owner           | Remove (soft delete). `204`                                                                                                                          |
| GET    | `/api/v1/products?sellerId=<uid>`              | none                     | A real seller's active listings                                                                                                                      |
| GET    | `/api/v1/users/:id`                            | none                     | Public profile: name, city, verified-phone flag, member since. No phone or email                                                                     |
| POST   | `/api/v1/swap-requests`                        | session + verified phone | Offer a piece `{ productId, offer, note? }`                                                                                                          |
| GET    | `/api/v1/swap-requests?box=received` or `sent` | session                  | Your requests, cursor-paginated. `contactPhone` only when accepted                                                                                   |
| PATCH  | `/api/v1/swap-requests/:id`                    | session                  | `{ action }` is `accept`, `decline` or `cancel`. The owner accepts or declines, the requester cancels                                                |

**Not found vs forbidden:** listings are public, so editing someone else's gives `403`. Swap requests are private, so a stranger gets `404`.

**Photo URLs:** a stored photo is `<base>/<uuid>`. Request a size by appending `-480.webp`, `-960.webp` or `-1600.webp`.

## Headers

- **`X-Request-Id`:** returned on every response. A well-formed incoming value (8–64 characters of letters, digits, `-` or `_`) is kept, so the frontend can trace a request end to end.
- **`RateLimit` and `RateLimit-Policy`:** follow the IETF draft-8 standard.
