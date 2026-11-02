# Testing

**Vitest** runs the tests, and **Supertest** sends real HTTP requests to the Express app. Integration tests use **mongodb-memory-server**, a real MongoDB process that lives only for the test run.

## Run the tests

```bash
npm test             # run everything once
npm run test:watch   # re-run on file changes
npm run check        # lint + formatting + type check + tests (run before every commit)
```

The first run downloads a MongoDB binary (about 140 MB, cached in `node_modules/.cache/mongodb-memory-server`), so it needs internet once, and again after deleting `node_modules`. After that, the full suite runs in about a second.

## Strategy

| Layer           | What it covers                                                                                  | Where                |
| --------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| **Unit**        | Pure logic in isolation: env parsing, error mapping, validation middleware. No database or HTTP | `tests/unit/`        |
| **Integration** | Real HTTP requests through the real middleware stack, against a real (in-memory) MongoDB        | `tests/integration/` |

Prefer integration tests for endpoints: they catch wiring mistakes that unit tests miss. Use unit tests for logic with many edge cases.

**Every feature should test:**

- success
- invalid input and missing fields
- logged out (401) and not allowed (403)
- not found
- duplicates (409)
- the database being unavailable
- edge cases such as empty lists, the maximum `limit` and boundary values

## Test database: isolated by design

- **One in-memory MongoDB per run.** `tests/helpers/global-setup.js` starts it before the run, passes its URI to test files through Vitest's `provide`/`inject`, and stops it afterwards.
- **A separate database per test file.** `testEnv()` in `tests/helpers/test-app.js` gives each file a uniquely named database, so files can run in parallel without seeing each other's data. `dropTestDatabase()` deletes it in `afterAll`.
- **Tests can't reach a real database.** Test URIs come only from the in-memory server. They never read `.env` or `MONGODB_URI` from your shell.
- **Transactions:** the in-memory server is a single node. A test that needs transactions should start a `MongoMemoryReplSet`.

## Writing a test

```js
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";

const { app, env } = buildTestApp(); // pass overrides, e.g. buildTestApp({ RATE_LIMIT_MAX: "2" })

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());

it("returns 404 for an unknown route", async () => {
  const res = await request(app).get("/api/v1/nope").expect(404);
  expect(res.body.error.code).toBe("NOT_FOUND");
});
```

**Tips:**

- `connectTestDatabase()` also creates indexes for every registered model, so unique-index tests work.
- To test a failure that's hard to trigger through real routes, build a tiny Express app with the real middleware, as `tests/integration/error-handling.test.js` does.
- Assert on the **status, the error `code` and the important fields**, not on whole error messages, which may be reworded.

## Current suite (milestone 3)

111 tests in 12 files:

| File                                 | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/env.test.js`                   | Defaults, conversion, frozen config, invalid values, secrets never echoed, `AUTH_SECRET` length, strict booleans, `OTP_DEV_CODES` refused in production, provider keys in pairs                                                                                                                                                                                                                                                                                                                                                                     |
| `unit/error-mapping.test.js`         | Zod → 400, bad JSON → 400, too large → 413, duplicate → 409 (fields only), cast → 400, unknown → generic 500                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `unit/validate.middleware.test.js`   | `req.validated`, defaults, invalid input, operator injection, missing body                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `integration/health.test.js`         | Live and ready, ready 503 while the database is down                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `integration/app.test.js`            | 404 shape, request IDs, invalid JSON, 413, security headers, CORS, docs list exactly the real endpoints, no docs in production, global rate limit                                                                                                                                                                                                                                                                                                                                                                                                   |
| `integration/error-handling.test.js` | Create, validation, injection, duplicate 409, 404, bad ID, generic 500, database down                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `integration/auth-otp.test.js`       | Phone formats; limits (30 s, 5 per hour, new window); **8 parallel sends → 1 succeeds**; CSRF 403; first and repeat login; wrong code, lockout, expiry; **code used once under concurrent verify**; `/me`; hashed tokens; expired sessions; logout; profile; MSG91 success and HTTP-200 error; SMS not configured; login rate limit; database down                                                                                                                                                                                                  |
| `integration/auth-google.test.js`    | Redirect and state cookie; sign-in, session and `returnTo`; repeat sign-in keeps edited name; profile step; many phone-less users; unverified email ignored; login CSRF; replayed or expired state; Google error and cancel; open redirects; not configured; attaching a phone; phone owned elsewhere → 409                                                                                                                                                                                                                                         |
| `integration/products.test.js`       | **Cursor pagination through 25 listings with no repeats**; sold hidden; public fields only (no `sellerId`); filters (city, category, condition, swap, seller); keyword search; fetch by IDs in order; bad filters, limit > 50, > 50 IDs, tampered cursor → 400; get, 404, bad ID; create with owner and name; login, verified phone and Origin required; MRP ≥ price, 1–8 photos, no extra fields; external photo URLs refused; **`explain()`: browse, city, category and seller queries use `IXSCAN`, with no `COLLSCAN` and no in-memory `SORT`** |
| `integration/uploads.test.js`        | Real sharp processing: 3 WebP sizes, **rotated upright, EXIF/GPS removed**, cache headers; small photos never enlarged; login and Origin; non-image → 400; missing file → 400; > 15 MB → 413; path traversal → 404                                                                                                                                                                                                                                                                                                                                  |
| `integration/threads.test.js`        | Feed pagination; `liked` per viewer and product card in one page; legacy embedded arrays never returned; posting (name, validation, unknown listing); like/unlike idempotent; **6 simultaneous likes by one user count once**; likes from several users; no orphan likes; replies with `replyCount`, oldest-first pagination; reply validation and 404s; **`explain()` for the feed, liked lookup and replies**                                                                                                                                     |
| `integration/migrations.test.js`     | Ordering; 001 index conversion and backfill; **002 copies replies (original IDs) and likes, sets `replyCount`, keeps legacy arrays, reruns safely**; 003 rewrites only old photo URLs, reruns safely                                                                                                                                                                                                                                                                                                                                                |

Google is replaced by `tests/helpers/fake-google.js` (injected through `createApp({ googleClient })`), so tests never call Google. MSG91 is tested by mocking `fetch`.
