# Database

MongoDB, through Mongoose 9. In development and production this is MongoDB Atlas. Tests use a throwaway in-memory MongoDB (see `TESTING.md`).

> **Status (milestone 1):** the connection lifecycle, safety settings and index creation are implemented. **There are no models yet.** The existing `products`, `threads` and `users` collections in Atlas are still written by the frontend's Next.js API routes. They move into backend modules in milestones 2–3, keeping the same collection and field names, so no data migration is needed.

## Connection (`src/config/database.js`)

- **One connection, opened once at startup** by `server.js`. If it fails, the process exits instead of serving errors.
- **Server selection timeout of 10 s:** a wrong URI or a blocked network fails fast with a clear log line.
- **Connection events are logged:** `disconnected` (warning), `reconnected` and `error`. A deliberate disconnect during shutdown doesn't log the warning.
- **Clean shutdown:** `disconnectDatabase()` runs after in-flight requests finish.
- **Readiness:** `isDatabaseConnected()` powers `GET /api/v1/health/ready`.

### Global Mongoose settings, and why

| Setting                    | Value   | Why                                                                                                                                            |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `strictQuery`              | `true`  | Filters on fields not in the schema are dropped, so typos and injected fields can't silently match everything                                  |
| `sanitizeFilter`           | `true`  | Values that look like operators (`{ "$gt": "" }`) are treated as plain values, a second defence against NoSQL injection behind Zod             |
| `bufferCommands`           | `false` | While disconnected, queries fail immediately (→ 500) instead of hanging for 10 s. Combined with readiness, this makes outages visible and fast |
| `autoCreate` / `autoIndex` | `false` | Models are imported before the connection exists. Indexes are created explicitly once connected (below)                                        |

## Indexes

On every startup, after connecting, `ensureIndexes()` runs `createIndexes()` for every registered model:

- **It only creates what's missing.** It never drops or changes an existing index. `syncIndexes()` can drop indexes, so it is deliberately not used.
- **It's cheap when nothing is missing.** If every index already exists, it's a no-op.

**Indexing strategy for future models:**

1. **Start from a real query.** Add an index because a specific query needs it (e.g. "listings in a city, newest first"), not "just in case". Every index slows writes and uses memory.
2. **Follow the ESR rule for compound indexes:** **E**quality fields first, then **S**ort, then **R**ange. For example, `{ city: 1, status: 1, createdAt: -1, _id: -1 }` for "active listings in a city, newest first".
3. **Use unique indexes for real-world uniqueness**, such as phone, email and slug. Duplicate inserts then fail atomically and become `409 CONFLICT`.
4. **Check with `explain()`.** Before shipping a new query on a big collection, confirm it uses an index (`IXSCAN`, not `COLLSCAN`).
5. **Plan large new indexes deliberately.** MongoDB builds indexes without blocking reads and writes, but a big build on a large collection still adds load. Create it in a quiet period, or from the Atlas UI, before deploying code that depends on it.

## Schema design principles

- **Design around how data is read.** Embed data that is always read together and stays bounded, for example a thread's latest replies. Reference data that grows without limit or is shared, for example a listing's seller.
- **Never let an array grow without bounds inside one document.** MongoDB documents have a 16 MB limit, and large arrays make every update slow. Store unbounded collections, such as likes or messages, in their own collection.
- **Every schema gets `timestamps: true`** (`createdAt`, `updatedAt`).
- **Validate in two places:** Zod at the API edge for client input, and the Mongoose schema for data integrity (required, enum, min and max).

## Query rules

- **Always bound result sets.** Every list query has a `limit` (default 20, max 50). No endpoint returns "everything".
- **Use cursor pagination for feeds.** Filter on the sort key (`createdAt` + `_id` as a tie-breaker) and use `limit + 1` to know whether there's a next page. Skip and offset paging is avoided for growing collections.
- **Use projections.** Fetch only the fields the response needs, especially in lists.
- **Use `.lean()` for reads that return JSON.** It skips building Mongoose documents and is faster and lighter.
- **Avoid N+1 queries.** Never query inside a loop. Gather IDs and fetch them in one `$in` query, or use one aggregation.
- **Use `populate` sparingly.** It runs extra queries. Prefer storing a small, rarely changing snapshot (e.g. the seller's display name), or a single `$in` lookup.
- **Use atomic updates.** Use update operators (`$inc`, `$addToSet`, `$pull`) with a condition in the filter, instead of read-modify-write in application code. Example: "like only if not already liked".
- **Handle duplicate-key errors centrally.** Error code `11000` becomes `409 CONFLICT` with the field names, never the duplicated values.

## Transactions

Use a transaction only when several documents must change together or not at all, for example accepting a swap that reserves two listings. Atlas clusters are replica sets and support them. For single-document changes, atomic update operators are enough and much cheaper. The in-memory test server is a single node, so tests that need transactions must start a `MongoMemoryReplSet` instead.

## Schema changes and migrations

MongoDB doesn't enforce a schema, but our code does. Change it carefully:

1. **Make changes backward-compatible first.** Add new fields as optional with sensible defaults, so old documents still work.
2. **Deploy code that reads both the old and new shape.**
3. **Backfill existing documents with a one-off script** that runs in batches, is idempotent, and is reviewed before running against production.
4. **Only then make the field required** or remove the old one.
5. **Back up before any destructive change.** Never drop collections, fields or indexes in production without explicit approval.

A dedicated migration tool is not set up yet. Add one (e.g. `migrate-mongo`) when the first real data migration is needed.
