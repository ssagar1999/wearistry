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

All codes in this table are defined in `src/utils/api-error.js` and produced by `src/middleware/error.middleware.js`. `UNAUTHENTICATED` and `FORBIDDEN` will be used by the auth module (milestone 2). Error codes are a contract with clients: **never rename one; add a new one.**

## Response format

**Success:**

```json
{ "data": { "status": "ok", "uptimeSeconds": 42 } }
```

**Lists add `meta`** (planned with the first list endpoint, milestone 3):

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

## Pagination (planned, milestone 3)

Growing collections (listings, threads) will use **cursor pagination**, which stays fast and consistent while new items are added. Offset paging (`?page=40`) gets slower and skips or repeats items as data changes.

- **Request:** `GET /api/v1/products?limit=20&cursor=<opaque>`
- **Limits:** `limit` defaults to 20, maximum 50. No endpoint returns an unbounded list.
- **Next page:** the response's `meta.nextCursor` is passed back as `cursor`. When it's `null`, there are no more pages.
- **Cursors are opaque:** clients must not build or parse them.

## Filtering and sorting

- **Filters are query parameters, validated by Zod:** `?city=Pune&category=Jackets`.
- **Only documented filters are accepted.** Unknown query parameters are rejected rather than passed to the database.

## Health endpoints

| Endpoint                   | Meaning                                | Responses                                                                                             |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Process is running                     | `200 { data: { status: "ok", uptimeSeconds } }`                                                       |
| `GET /api/v1/health/ready` | Can serve traffic (database connected) | `200 { data: { status: "ok", checks: { database: "up" } } }` or `503` with `"unavailable"` / `"down"` |

Readiness returns `503` with a `data` body, not an `error`, because "not ready" is an expected state that load balancers poll for.

## Headers

- **`X-Request-Id`:** returned on every response. A well-formed incoming value (8–64 characters of letters, digits, `-` or `_`) is kept, so the frontend can trace a request end to end.
- **`RateLimit` and `RateLimit-Policy`:** follow the IETF draft-8 standard.
