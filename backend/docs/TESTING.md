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

## Current suite (milestone 1)

| File                                 | Covers                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/env.test.js`                   | Defaults, type conversion, frozen config, missing or invalid values, secrets never echoed                                                             |
| `unit/error-mapping.test.js`         | Zod → 400, bad JSON → 400, too large → 413, duplicate key → 409 (field names, no values), cast error → 400, unknown → generic 500                     |
| `unit/validate.middleware.test.js`   | Parsed input on `req.validated`, defaults, invalid input, operator injection, missing body                                                            |
| `integration/health.test.js`         | Live 200, ready 200, ready 503 while the database is down (live still 200)                                                                            |
| `integration/app.test.js`            | 404 format, request ID generate/keep/replace, invalid JSON, 413, security headers, CORS allow and block, docs only outside production, rate limit 429 |
| `integration/error-handling.test.js` | Create, missing or invalid fields, NoSQL injection, duplicate 409, not-found 404, bad ID 400, generic 500, database unavailable 500                   |
