# Security

Each item is marked as either **Implemented** (it exists in the code and is tested) or **Planned** (it isn't built yet).

## Authentication: Implemented

Two ways to log in. Both end with the same kind of session.

**Phone OTP** (`modules/auth/otp.service.js`):

- **A 6-digit code from a cryptographically secure random source** (`crypto.randomInt`), valid for 5 minutes.
- **Only a keyed hash is stored:** HMAC-SHA256 with `AUTH_SECRET`. A database leak doesn't reveal codes, and 6-digit hashes can't be brute-forced offline without the secret.
- **Per-phone limits:** one code every 30 s and 5 per hour, enforced atomically in MongoDB (works across API instances), plus 5 verify attempts per code. Each attempt is counted atomically, and a code works **once**, even if submitted twice at the same moment (tested).
- **Per-IP login limit:** `AUTH_RATE_LIMIT_MAX` requests per 15 minutes (default 30) on all login endpoints.
- **SMS goes through MSG91.** `OTP_DEV_CODES=true` returns the code in the response for local development, and the server **refuses to start** with it in production.

**Google sign-in** (`modules/auth/google.service.js`, `google.client.js`):

- **OAuth 2.0 Authorization Code flow with PKCE (S256) and OpenID Connect,** using `openid-client`, a certified library. It validates the ID token's signature, issuer, audience, expiry and **nonce**. We never hand-write OAuth crypto.
- **`state` is bound to the browser:** it's stored server-side (hashed) and also set in a short-lived `httpOnly` cookie scoped to the callback path. The callback requires both to match, which blocks **login CSRF** (an attacker logging you into their account). States are single-use and expire after 10 minutes (tested).
- **Users are matched by Google's stable `sub`, never by email.** Email is stored only when Google marks it verified.
- **Redirect target after login:** `returnTo` must be a path on our own site (`/…`, not `//…` or containing `\`), otherwise it becomes `/`. That prevents open redirects (tested).
- **Failures redirect to `/login?error=…`** without details. The reason is logged server-side.

**Sessions** (`modules/auth/session.service.js`):

- **A random 256-bit token in the `wearistry_sid` cookie.** Only its SHA-256 hash is stored in `sessions`, so stolen database rows can't be used as cookies.
- **Cookie settings:** `httpOnly` (page scripts can't read it; checked in the browser), `SameSite=Lax`, `Secure` in production and `Path=/`. Expiry is `SESSION_TTL_DAYS` (default 30).
- **Server-side and revocable:** logout deletes the session row. Expired sessions are rejected immediately, and MongoDB's TTL index removes them.
- **No passwords exist,** so nothing is hashed with bcrypt or argon2. If email-and-password login is ever added, use argon2id.

## Authorization: Implemented (foundation)

- **`loadSession`** attaches `req.user` for valid sessions. **`requireUser`** rejects anonymous requests with `401 UNAUTHENTICATED`.
- **Users can only read and change their own account** (`/auth/me` and `PATCH /users/me` act on `req.user`, never on an ID from the client).
- **Listings** record `sellerId` from the session, never from the request body (strict schemas reject extra fields). Threads and replies take the author from the session too.
- **Business rules in services:** selling requires a verified phone and a name (`403`), and posting or replying requires a name.
- **Ownership is checked in services,** with the owner also part of the database filter, so a listing can't change hands between the check and the write:
  - `PATCH` and `DELETE /products/:id` need `sellerId = req.user.id`. Someone else's listing gets `403`, and curated listings with no owner can't be edited by anyone. Tested.
  - Swap requests: only the listing's owner can accept or decline, and only the requester can cancel (`403` for the wrong party). A stranger gets `404`, so they learn nothing about requests they aren't part of. Only a `pending` request can change, even when decisions arrive at the same moment (tested).
- **Contact details are shared only by consent:** a phone number is returned in a swap request only after the owner accepts, and only to those two people (tested). Public profiles (`GET /users/:id`) never include phone or email.
- **Soft-deleted listings** (`removed`) return `404` everywhere and can't be edited again.
- **Spam limits:** swap requests are limited to 20 per user per hour.

## CSRF: Implemented

1. **The `SameSite=Lax` session cookie** isn't sent on cross-site POST, PATCH, PUT or DELETE requests.
2. **`requireTrustedOrigin`** (`middleware/trusted-origin.middleware.js`): every state-changing `/api/v1` request must carry an `Origin` (or `Referer`) matching `APP_URL` or `CORS_ORIGINS`, otherwise it gets `403 FORBIDDEN`. Browsers always send `Origin` on these requests and pages can't forge it. Tested, including a logged-in request from another site being refused.

## Environment secrets: Implemented

- **Secrets live only in environment variables** (`.env` locally, the platform's secret settings in production). `.env` is git-ignored.
- **`AUTH_SECRET`** must be at least 32 characters. Rotating it invalidates pending OTP codes and in-progress Google sign-ins, but **not** existing sessions.
- **Startup validation never prints values.**
- **Rotate any credential immediately** if it appears in a chat, a ticket, a log or a commit.

## CORS: Implemented

- **Only `CORS_ORIGINS`** get `Access-Control-Allow-Origin` with credentials. Others get no CORS headers.
- **In normal use the browser never needs CORS:** it calls the web app, which proxies `/api/v1` to the API (same origin).

## Rate limiting: Implemented

| Limit                                                        | Scope                        | Where            |
| ------------------------------------------------------------ | ---------------------------- | ---------------- |
| `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` (120 per minute) | Per IP, all `/api/v1` routes | In memory        |
| `AUTH_RATE_LIMIT_MAX` per 15 min (30)                        | Per IP, login endpoints      | In memory        |
| 1 code per 30 s, 5 per hour                                  | Per phone                    | MongoDB (atomic) |
| 5 attempts per code                                          | Per code                     | MongoDB (atomic) |

- **`TRUST_PROXY_HOPS` must match the real proxy chain** (1 behind the Next.js proxy), or limits apply to the wrong IP.
- **In-memory counters are per instance.** Move them to Redis before running several instances (see `SCALABILITY.md`).

## Input validation and NoSQL injection: Implemented

- **All input is parsed by strict Zod schemas** in `validate()`. Controllers read typed values with `validated(req, part, schema)`.
- **Phone numbers are normalised and checked** to be Indian mobiles. Codes must be exactly 6 digits. Unknown fields and operator objects (`{ "$gt": "" }`) are rejected (tested).
- **Mongoose adds `sanitizeFilter` and `strictQuery`.** Server-written operators must use `mongoose.trusted()` (see `DATABASE.md`).

## Photo uploads: Implemented

- **Login required,** plus the Origin check. Limited to **80 uploads per user per hour,** because image processing is CPU-heavy.
- **Size and count:** files up to **15 MB**, one per request, held in memory (multer). Nothing unprocessed is written to disk.
- **Content check:** sharp checks the file's real format, regardless of its name or `Content-Type`: JPEG, PNG, WebP, AVIF, HEIF or TIFF only. It also caps decoded size at 60 megapixels (decompression-bomb protection).
- **Privacy:** every photo is re-encoded, which **strips all metadata, including GPS location** (tested). A seller's home address can't leak through photo EXIF.
- **Only our own photo URLs can go on a listing:** `/api/v1/media/<uuid>` or `S3_PUBLIC_URL/photos/<uuid>`. That blocks hot-linking or tracking pixels from other sites.
- **The local media route** only serves strictly named files (`<uuid>-<480|960|1600>.webp`), so there's no path traversal (tested). In production photos are on S3 behind CloudFront, and the API never serves files.

## Security headers, size limits, safe errors and logging: Implemented

- **Helmet** sets the security headers, and `X-Powered-By` is removed.
- **JSON bodies are capped at 100 KB.**
- **Clients see only `ApiError` messages.** Unexpected errors become a generic 500. MSG91 and Google error details stay in server logs (tested).
- **Logs redact** cookies, `Authorization`, `Set-Cookie`, and fields named `password`, `token`, `accessToken`, `refreshToken`, `idToken` and `otp`. Request logs contain only the ID, method, URL and IP. OTP codes are never logged.

## Data exposure

- **`toPublicUser`** returns only `id` (the public `uid`), `name`, `city`, `phone`, `phoneVerified`, `email` and `avatarUrl`. It's used only for the user themself. Internal fields (`_id`, `googleSub`) are never loaded for responses.
- **Planned:** public seller profiles will use a separate, smaller shape with no phone or email.

## Checklist for every change

| Risk                  | Rule                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| Injection             | Strict Zod schemas. Never pass raw input into queries                             |
| Broken access control | Act on `req.user`. Check ownership in services                                    |
| Mass assignment       | Copy only validated fields into updates                                           |
| Data exposure         | Use projections, and never return other users' phone or email                     |
| Brute force           | Rate-limit anything guessable                                                     |
| CSRF                  | Every state-changing route goes through `/api/v1` (Origin check)                  |
| Open redirect         | Redirect only to validated same-site paths                                        |
| Dependencies          | Run `npm audit --omit=dev` before releases. Install scripts are denied by default |
