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

## Current suite (milestone 2)

80 tests in 9 files:

| File                                 | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/env.test.js`                   | Defaults, type conversion, frozen config, missing or invalid values, secrets never echoed, `AUTH_SECRET` length, strict booleans, `OTP_DEV_CODES` refused in production, provider keys in pairs                                                                                                                                                                                                                                                                                                                                                             |
| `unit/error-mapping.test.js`         | Zod → 400, bad JSON → 400, too large → 413, duplicate → 409 (fields only), cast → 400, unknown → generic 500                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `unit/validate.middleware.test.js`   | `req.validated`, defaults, invalid input, operator injection, missing body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `integration/health.test.js`         | Live and ready, ready 503 while the database is down                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `integration/app.test.js`            | 404 shape, request IDs, invalid JSON, 413, security headers, CORS, docs list exactly the real endpoints, no docs in production, global rate limit                                                                                                                                                                                                                                                                                                                                                                                                           |
| `integration/error-handling.test.js` | Create, validation, injection, duplicate 409, 404, bad ID, generic 500, database down                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `integration/auth-otp.test.js`       | Phone formats; invalid input; 30 s gap; 5 per hour; new hourly window; **8 parallel sends → exactly 1 succeeds**; Origin/CSRF 403; first login creates the user and sets a secure cookie; repeat login, no duplicate; wrong code → 401, locked after 5; expired code; **code used once under concurrent verify**; `/me` 200/401; only token hashes stored; expired session rejected; logout; profile validation, 401 and cross-site 403; MSG91 success and HTTP-200 error (mocked `fetch`); SMS not configured → 503; login rate limit; database down → 500 |
| `integration/auth-google.test.js`    | Redirect URL and state cookie; user creation, session and `returnTo`; repeat sign-in doesn't overwrite an edited name; profile step for nameless users; many phone-less users allowed; unverified email ignored; state/cookie mismatch (login CSRF); replayed and expired state; Google error and cancel; open-redirect attempts; not configured → 503; attaching a phone to a Google account; phone owned by another account → 409                                                                                                                         |
| `integration/migrations.test.js`     | Ordering; 001 converts the old index, keeps phone uniqueness, backfills `phoneVerifiedAt` and is idempotent                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Google is replaced by `tests/helpers/fake-google.js` (injected through `createApp({ googleClient })`), so tests never call Google. MSG91 is tested by mocking `fetch`.
