# Database

MongoDB (Atlas in development and production) through Mongoose 9. Tests use a throwaway in-memory MongoDB (see `TESTING.md`).

Related docs:

- `SCALABILITY.md`: growth, bottlenecks and the scaling plan.
- `SHARDING_STRATEGY.md`: a shard-key plan for every collection.
- `MIGRATIONS.md`: how schema changes ship.

> **Status (milestone 2):** the API owns `users`, `sessions`, `otp_challenges` and `oauth_states`. The `products` and `threads` collections are still written by the frontend's Next.js API routes until milestone 3, and are described here so cross-collection references are clear.

## Collections at a glance

| Collection          | Owner                 | One document =                       | Grows with              | Lifetime                                                         |
| ------------------- | --------------------- | ------------------------------------ | ----------------------- | ---------------------------------------------------------------- |
| `users`             | API (`modules/users`) | A person                             | Sign-ups                | Permanent                                                        |
| `sessions`          | API (`modules/auth`)  | One logged-in browser                | Active logins           | Auto-deleted at `expiresAt` (TTL, default 30 days)               |
| `otp_challenges`    | API (`modules/auth`)  | The current login code for one phone | Phones requesting codes | Auto-deleted 1 hour after the last send (TTL)                    |
| `oauth_states`      | API (`modules/auth`)  | One in-progress Google sign-in       | Sign-in attempts        | Deleted when used; leftovers auto-deleted after 10 minutes (TTL) |
| `schema_migrations` | `npm run migrate`     | One applied migration                | Migrations              | Permanent, tiny                                                  |
| `products`          | Frontend (until M3)   | A listing                            | Listings                | Permanent                                                        |
| `threads`           | Frontend (until M3)   | A post, with its replies embedded    | Posts                   | Permanent                                                        |

## Relationships, and why each is embedded or referenced

| Relationship                            | Decision                                                                             | Why                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| User → login identities (phone, Google) | **Embedded** as fields (`phone`, `googleSub`)                                        | A person has at most a couple, so it's small and bounded, and always read with the user. Each identity gets its own unique index                   |
| User → sessions                         | **Referenced** (`sessions.userId` = `users.uid`)                                     | Unbounded over time (every device and every login). Embedding would grow the user document forever and turn every request into a write on the user |
| Phone → OTP challenge                   | **Separate collection**, one document per phone                                      | Short-lived, write-heavy rate-limit counters. Kept off the user so OTP traffic, including for numbers that never sign up, never touches `users`    |
| Threads → author                        | **Referenced** by `uid`, with the author's display name copied in (`threads.author`) | Showing a feed must not need a lookup per post (N+1). The copied name is a deliberate snapshot                                                     |
| Threads → replies                       | **Embedded** today (frontend)                                                        | ⚠️ Unbounded. Flagged in `SCALABILITY.md`: replies move to their own collection in milestone 3                                                     |
| Threads → likes                         | `likedBy` array of uids, embedded today (frontend)                                   | ⚠️ Unbounded. Same plan: a `thread_likes` collection with a unique `{ threadId, userId }` index                                                    |

**References use `users.uid`**, a random UUID, not the MongoDB `_id`, for two reasons. It doesn't expose internal IDs. And it stays stable if data is ever moved or merged between databases.

## Schemas and indexes

Every index below exists because a specific query needs it. The rule: **no index without a query, and no frequent query without an index.**

### `users` (`src/modules/users/user.model.js`)

| Field                    | Type and validation                      | Notes                                                                    |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| `uid`                    | string, required, immutable, random UUID | Public ID, used for references                                           |
| `phone`                  | `^[6-9]\d{9}$`, optional                 | 10-digit Indian mobile                                                   |
| `phoneVerifiedAt`        | Date, optional                           | Set when verified by OTP; selling requires a verified phone              |
| `googleSub`              | string, optional                         | Google's stable account ID. Never match users by email, which can change |
| `email`                  | lowercased, optional                     | Stored only if Google says it's verified                                 |
| `name`, `city`           | strings, max 40                          | Profile                                                                  |
| `avatarUrl`              | string, optional                         | From Google on first sign-in                                             |
| `createdAt`, `updatedAt` | timestamps                               |                                                                          |

| Index                                                    | Serves                                            | Notes                                                                            |
| -------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `{ uid: 1 }` unique                                      | Session → user on **every authenticated request** |                                                                                  |
| `{ phone: 1 }` unique, **partial** (`phone` is a string) | OTP login and attaching a phone                   | Partial so the many Google-only users without a phone don't collide on "missing" |
| `{ googleSub: 1 }` unique, partial                       | Google sign-in                                    |                                                                                  |

No index on `email`, because nothing queries by it yet.

### `sessions` (`src/modules/auth/session.model.js`)

`tokenHash` (SHA-256 of the cookie token; the token itself is never stored), `userId` (`users.uid`), `expiresAt`, `createdAt`.

| Index                                            | Serves                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `{ tokenHash: 1 }` unique                        | Cookie → session on every authenticated request, and logout                                                            |
| `{ expiresAt: 1 }` TTL (`expireAfterSeconds: 0`) | MongoDB deletes expired sessions in the background, so the collection size tracks _active_ logins, not all logins ever |

There's no index on `userId` yet, because no query uses it. Add `{ userId: 1 }` together with "log out of all devices".

### `otp_challenges` (`src/modules/auth/otp-challenge.model.js`)

`phone`, `codeHash` (HMAC with `AUTH_SECRET`), `codeExpiresAt`, `attempts`, `lastSentAt`, `windowStartedAt`, `sendsInWindow`, `expireAt`.

| Index                 | Serves                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `{ phone: 1 }` unique | Send and verify. Also guarantees one challenge per phone, which the atomic rate limit relies on |
| `{ expireAt: 1 }` TTL | Removes the document 1 hour after the last send                                                 |

The rate-limit counters are plain numbers, not an array of send timestamps, so the document size is fixed.

### `oauth_states` (`src/modules/auth/oauth-state.model.js`)

`stateHash` (HMAC of the OAuth `state`), `codeVerifier` (PKCE), `nonce`, `returnTo`, `expiresAt`.

| Index                     | Serves                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| `{ stateHash: 1 }` unique | The single lookup at callback (`findOneAndDelete`, which makes it single-use) |
| `{ expiresAt: 1 }` TTL    | Abandoned sign-ins disappear after about 10 minutes                           |

## Query patterns, and what each costs

| Endpoint                    | Database operations                                                                                                | Cost                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Any authenticated request   | `sessions.findOne({ tokenHash, expiresAt > now })`, then `users.findOne({ uid })` with a projection                | 2 indexed point reads  |
| `POST /auth/otp/send`       | 1 conditional `updateOne` (pipeline update), plus at most 1 `insertOne` and, only when over the limit, 1 `findOne` | 1–3 indexed operations |
| `POST /auth/otp/verify`     | `findOneAndUpdate` (`$inc` attempts), `deleteOne`, user upsert, `sessions.insertOne`                               | 4 indexed operations   |
| `GET /auth/google/start`    | `oauth_states.insertOne`                                                                                           | 1 write                |
| `GET /auth/google/callback` | `oauth_states.findOneAndDelete`, user upsert by `googleSub`, `sessions.insertOne`                                  | 3 indexed operations   |
| `POST /auth/logout`         | `sessions.deleteOne({ tokenHash })`                                                                                | 1                      |
| `PATCH /users/me`           | `users.findOneAndUpdate({ uid })`                                                                                  | 1                      |

There are no list endpoints in the API yet. When they arrive (milestone 3) they must use cursor pagination with `limit` ≤ 50, as described under Query rules.

## Concurrency and integrity

- **Uniqueness is enforced by unique indexes,** never by "check, then insert". Duplicate-key errors (`11000`) become `409 CONFLICT`. The one exception is attaching a phone that belongs to another account, which returns a specific message.
- **First logins are single upserts** keyed on a unique field (`phone` or `googleSub`). Two simultaneous first logins can't create two accounts.
- **OTP send limits** (30 s between codes, 5 per hour) are checked and updated in **one conditional update**. A test fires 8 parallel requests: exactly 1 succeeds and 7 get 429.
- **OTP verify** uses up an attempt atomically (`$inc` with `attempts < 5` in the filter). The code is consumed with `deleteOne({ phone, codeHash })`, so a code works only once even if it's submitted twice at the same instant (tested).
- **No multi-document transactions are used.** Each operation above is atomic on its own document, which is enough here.

## Global Mongoose settings, and why (`src/config/database.js`)

| Setting                    | Value   | Why                                                                                                                                                                             |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strictQuery`              | `true`  | Filters on fields not in the schema are dropped                                                                                                                                 |
| `sanitizeFilter`           | `true`  | Any query operator in a filter (`{ "$gt": … }`) is neutralised **unless the server marks it** with `mongoose.trusted(...)`. A second defence against NoSQL injection behind Zod |
| `bufferCommands`           | `false` | While disconnected, queries fail at once (→ 500) instead of hanging, and readiness shows `down`                                                                                 |
| `autoCreate` / `autoIndex` | `false` | Models are imported before connecting. `connectDatabase()` creates indexes explicitly afterwards                                                                                |

> ⚠️ **Developer rule:** with `sanitizeFilter` on, every operator **you** write in a filter must be wrapped: `{ expiresAt: mongoose.trusted({ $gt: new Date() }) }`. Without it, the query silently matches nothing or throws a cast error. Update operators (`$set`, `$inc`, …) are not affected. Never wrap values that come from the client.

## Connection lifecycle

- **One connection, opened once at startup.** A 10 s server-selection timeout means a bad URI or network fails fast, and the process exits.
- **Then `ensureIndexes()` runs `createIndexes()` for every model.** It only creates what's missing and never drops or changes an index. If an existing index has different options, startup fails with "run `npm run migrate` first" (see `MIGRATIONS.md`).
- **Events are logged:** `disconnected` (warning, not during deliberate shutdown), `reconnected` and `error`.
- **Shutdown:** `disconnectDatabase()` runs after in-flight requests finish.

## Query rules for new code

1. **Bound every result set:** `limit` defaults to 20 with a max of 50. Never return a whole collection.
2. **Use cursor pagination for growing lists.** Sort on `{ createdAt: -1, _id: -1 }`, filter after the last seen pair, and use `limit + 1` to detect a next page. Don't use `skip` for growing collections.
3. **Project only the fields you return,** and use `.lean()` for read-only results.
4. **No N+1 queries:** batch with `$in`, or copy a small, stable field (like the author name) into the document.
5. **Use atomic update operators** with conditions in the filter, never read-modify-write.
6. **Check new queries with `explain("executionStats")`** against realistic data. You want `IXSCAN` with `totalDocsExamined` close to `nReturned`.
7. **Every new collection gets an entry** here, in `SCALABILITY.md` and in `SHARDING_STRATEGY.md`.
