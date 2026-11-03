# Database

MongoDB (Atlas in development and production) through Mongoose 9. Tests use a throwaway in-memory MongoDB (see `TESTING.md`). The API owns **all** collections; the web app has no database access.

Related docs:

- `SCALABILITY.md`: growth, bottlenecks and the scaling plan.
- `SHARDING_STRATEGY.md`: a shard-key plan for every collection.
- `MIGRATIONS.md`: how schema changes ship.

## Collections at a glance

| Collection          | Module            | One document =                         | Grows with                    | Lifetime                                                     |
| ------------------- | ----------------- | -------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `users`             | `users`           | A person                               | Sign-ups                      | Permanent                                                    |
| `sessions`          | `auth`            | One logged-in browser                  | Active logins                 | Auto-deleted at `expiresAt` (TTL)                            |
| `otp_challenges`    | `auth`            | The current login code for one phone   | Phones requesting codes       | Auto-deleted 1 h after the last send (TTL)                   |
| `oauth_states`      | `auth`            | One in-progress Google sign-in         | Sign-in attempts              | Deleted when used; leftovers after 10 min (TTL)              |
| `products`          | `products`        | A listing                              | Listings                      | Permanent (`status` marks sold or swapped)                   |
| `threads`           | `threads`         | A community post                       | Posts                         | Permanent                                                    |
| `thread_replies`    | `threads`         | A reply to a thread                    | Replies (**unbounded**)       | Permanent                                                    |
| `thread_likes`      | `threads`         | One user's like of one thread          | Likes (**unbounded**)         | Deleted on unlike                                            |
| `swap_requests`     | `swaps`           | One offer: "my piece for your listing" | Swap requests (**unbounded**) | Permanent (status: pending, accepted, declined or cancelled) |
| `schema_migrations` | `npm run migrate` | One applied migration                  | Migrations                    | Permanent, tiny                                              |

## Relationships, and why each is embedded or referenced

| Relationship                            | Decision                                                                                 | Why                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| User → login identities (phone, Google) | **Embedded** as fields                                                                   | A person has at most a couple, so it's small and bounded, and always read with the user             |
| User → sessions                         | **Referenced** (`sessions.userId` = `users.uid`)                                         | Unbounded over time. Embedding would grow the user forever and turn every request into a user write |
| Phone → OTP challenge                   | **Separate collection**, one doc per phone                                               | Write-heavy, short-lived counters, kept off `users`                                                 |
| Listing → photos                        | **Embedded** array of URLs (`images`, 1–8, enforced)                                     | Bounded, owned by the listing and always shown with it                                              |
| Listing → seller                        | **Referenced** by `sellerId` (`users.uid`), with the seller's name **copied** (`seller`) | Feeds show the name without a user lookup per listing (no N+1). The copy is a deliberate snapshot   |
| Thread → author                         | **Referenced** by `authorId`, with the display name copied (`author`)                    | Same reason                                                                                         |
| Thread → listing                        | **Referenced** by `productId` (`products.slug`)                                          | Listings change (price, sold). The feed fetches cards for a whole page in **one** `$in` query       |
| Thread → replies                        | **Referenced:** `thread_replies.threadId`                                                | **Unbounded.** Embedding would grow the thread toward the 16 MB limit and rewrite it on every reply |
| Thread → likes                          | **Referenced:** `thread_likes` with unique `{ threadId, userId }`                        | **Unbounded,** and the unique index _is_ the "one like per person" rule                             |
| Thread → counts                         | `likes` and `replyCount` **on the thread**                                               | So the feed shows counts without counting rows. Kept in step with atomic `$inc`                     |

**References use public IDs:** `users.uid` (a random UUID), `products.slug` and `threads.slug`, never MongoDB `_id`s. They don't expose internals and stay stable if data moves.

## Schemas and indexes

Every index serves a specific query. **No index without a query, and no frequent query without an index.**

### `users`

`uid` (public, immutable UUID), `phone` (`^[6-9]\d{9}$`), `phoneVerifiedAt`, `googleSub`, `email` (only if verified by Google), `name`, `city`, `avatarUrl`, timestamps.

| Index                                              | Serves                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `{ uid: 1 }` unique                                | Session → user on every authenticated request                                |
| `{ phone: 1 }` unique, partial (phone is a string) | OTP login and attaching a phone. Partial, so Google-only users don't collide |
| `{ googleSub: 1 }` unique, partial                 | Google sign-in                                                               |

### `sessions`

`tokenHash` (SHA-256 of the cookie token), `userId`, `expiresAt`, `createdAt`.

| Index                     | Serves                                  |
| ------------------------- | --------------------------------------- |
| `{ tokenHash: 1 }` unique | Cookie → session; logout                |
| `{ expiresAt: 1 }` TTL    | Background deletion of expired sessions |

### `otp_challenges`

`phone`, `codeHash` (HMAC), `codeExpiresAt`, `attempts`, `lastSentAt`, `windowStartedAt`, `sendsInWindow`, `expireAt`.

| Index                 | Serves                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `{ phone: 1 }` unique | Send and verify. Also the "one challenge per phone" rule the atomic limit relies on |
| `{ expireAt: 1 }` TTL | Cleanup 1 h after the last send                                                     |

### `oauth_states`

`stateHash`, `codeVerifier`, `nonce`, `returnTo`, `expiresAt`.

| Index                     | Serves                            |
| ------------------------- | --------------------------------- |
| `{ stateHash: 1 }` unique | The single-use lookup at callback |
| `{ expiresAt: 1 }` TTL    | Cleanup of abandoned sign-ins     |

### `products`

- **Listing details:** `slug` (public ID), `title`, `category`, `size`, `condition`, `price` and `mrp` (whole rupees), `story`, `city`, `state`, `exchange`, `status` (`active`, `sold` or `swapped`), timestamps.
- **Photos:** `image` (the cover) and `images` (1–8).
- **Seller:** `seller` (a copy of the name), `sellerSlug` (curated sample sellers) and `sellerId`. `sellerId` is missing on listings created before ownership existed.

| Index (ESR order)                                                          | Serves                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `{ slug: 1 }` unique                                                       | Product page, ID lists (saved items), thread cards                          |
| `{ status: 1, createdAt: -1, _id: -1 }`                                    | Browse: newest active listings, cursor-paginated                            |
| `{ status: 1, city: 1, createdAt: -1, _id: -1 }`                           | Browse by city                                                              |
| `{ status: 1, category: 1, createdAt: -1, _id: -1 }`                       | Browse by category                                                          |
| `{ sellerSlug: 1, createdAt: -1, _id: -1 }` partial (`sellerSlug > ""`)    | Curated seller pages                                                        |
| `{ sellerId: 1, createdAt: -1, _id: -1 }` partial (`sellerId` is a string) | "My listings" (`GET /products/mine`) and public seller pages (`?sellerId=`) |
| `{ title: "text", story: "text" }`                                         | Keyword search (`?q=`)                                                      |

Filters on `condition` and `exchange`, and `city` combined with `category`, aren't separately indexed: they're applied while walking the closest index above. That's fine because results stop at the page size. Add a dedicated compound index only if `explain()` on real data shows many documents examined per result.

### `threads`

`slug`, `author` (copied name), `authorId`, `city`, `kind` (`post`, `looking` or `swap`), `text` (≤ 500), `productId`, `likes` (count), `replyCount` (count), `at` (created time in epoch ms; an existing field the feed sorts on), timestamps.

| Index                 | Serves                                           |
| --------------------- | ------------------------------------------------ |
| `{ slug: 1 }` unique  | Likes, replies and existence checks by thread ID |
| `{ at: -1, _id: -1 }` | The feed: newest first, cursor-paginated         |

**Legacy fields:** documents written before milestone 3 still hold embedded `replies` and `likedBy` arrays. Migration 002 copies them into `thread_replies` and `thread_likes`. The API never reads them (explicit projections), and a later "contract" migration removes them (see `MIGRATIONS.md`).

### `thread_replies`

`threadId` (`threads.slug`), `authorId` (missing on migrated replies), `author` (copied name), `text` (≤ 500), `createdAt`.

| Index                                   | Serves                                             |
| --------------------------------------- | -------------------------------------------------- |
| `{ threadId: 1, createdAt: 1, _id: 1 }` | A thread's replies, oldest first, cursor-paginated |

### `thread_likes`

`threadId`, `userId`, `createdAt`.

| Index                               | Serves                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `{ threadId: 1, userId: 1 }` unique | One like per person; like and unlike; "which of these 20 threads did I like?" (`{ userId, threadId: { $in } }`) |

### `swap_requests`

`productId` (`products.slug`), `productTitle` and `productImage` (copies), `ownerId` (`users.uid` of the seller), `ownerName`, `requesterId`, `requesterName`, `offer` (≤ 300), `note` (≤ 500), `status`, timestamps.

| Index                                                                        | Serves                                                                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `{ ownerId: 1, createdAt: -1, _id: -1 }`                                     | "Requests I received", newest first, cursor-paginated                                                                      |
| `{ requesterId: 1, createdAt: -1, _id: -1 }`                                 | "Requests I sent"                                                                                                          |
| `{ requesterId: 1, productId: 1 }` unique, **partial** (`status: "pending"`) | One open request per person per piece. Partial, so a person can ask again once an earlier request is declined or cancelled |

Why a separate collection: requests accumulate without limit. The names, title and photo are copied in so both inboxes render with no lookups.

**Contact details:** a phone number is never stored here. When a request is `accepted`, the API looks up each party's phone from `users` (one batched query per page) and returns it only to the two people involved.

**Soft delete (`products.status = "removed"`):** "Remove" hides a listing from browse, search, product pages, saved lists and thread cards, but erases nothing, so it's reversible and no reference breaks. All the browse indexes start with `status`, so removed listings are skipped by the index itself. Hard deletion, if ever needed, would be a deliberate cleanup job.

### Unused indexes left in Atlas (to drop in a cleanup migration)

The web app created these. They're now unused, but they still cost writes and memory:

- `products.city_1` and `products.sellerSlug_1`: superseded by the compound indexes above.
- `threads.at_1`: superseded by `{ at: -1, _id: -1 }`.
- `threads.authorId_1`: no query uses it.

They're kept until the new code has run in production, then dropped by migration 004 (see `MIGRATIONS.md`).

## Query patterns, and what each costs

| Endpoint                              | Database operations                                                                                                         | Cost                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Any authenticated request             | `sessions.findOne` + `users.findOne` (projection)                                                                           | 2 indexed point reads |
| `POST /auth/otp/send`                 | 1 conditional update (+ ≤ 1 insert, + 1 read only when over the limit)                                                      | 1–3                   |
| `POST /auth/otp/verify`               | `$inc` attempts, delete, user upsert, session insert                                                                        | 4                     |
| `GET /auth/google/start` / `callback` | 1 insert / delete + upsert + insert                                                                                         | 1 / 3                 |
| `PATCH /users/me`                     | 1 update                                                                                                                    | 1                     |
| `GET /products`                       | 1 index-ordered find (≤ 51 docs, projected, lean)                                                                           | 1                     |
| `GET /products?ids=…` (≤ 50)          | 1 `$in` on `slug`                                                                                                           | 1                     |
| `GET /products/:id`                   | 1 point read                                                                                                                | 1                     |
| `POST /products`                      | 1 insert                                                                                                                    | 1                     |
| `POST /uploads`                       | No database; image processing and storage only                                                                              | 0                     |
| `GET /products/mine`                  | 1 index-ordered find on `{ sellerId, createdAt, _id }` (status filtered during the index scan)                              | 1                     |
| `PATCH /products/:id`                 | 1 point read (ownership and price check) + 1 conditional update (owner in the filter)                                       | 2                     |
| `DELETE /products/:id`                | 1 point read + 1 update (soft delete)                                                                                       | 2                     |
| `GET /users/:id`                      | 1 point read with a projection                                                                                              | 1                     |
| `POST /swap-requests`                 | 1 product read + 1 insert (the unique partial index rejects duplicates)                                                     | 2                     |
| `GET /swap-requests`                  | 1 index-ordered find + (only if any are accepted) 1 batched `users` lookup                                                  | 1–2                   |
| `PATCH /swap-requests/:id`            | 1 conditional update (`pending` status and the right party in the filter); + 1 read only when it fails, to choose the error | 1–2                   |
| `GET /threads`                        | Threads page + likes `$in` (if logged in) + product cards `$in`, so **3 queries per page, whatever its size**               | 3                     |
| `POST /threads`                       | (product check) + insert                                                                                                    | 1–2                   |
| `POST` / `DELETE /threads/:id/like`   | exists + insert/delete + `$inc` + read count                                                                                | 4                     |
| `GET /threads/:id/replies`            | exists + 1 index-ordered find                                                                                               | 2                     |
| `POST /threads/:id/replies`           | exists + insert + `$inc`                                                                                                    | 3                     |

The important list queries (browse, my listings, feed, replies, both swap inboxes) are checked in tests with `explain("executionStats")`: they must use `IXSCAN`, with no `COLLSCAN` and no in-memory `SORT` (`tests/integration/products.test.js` and `threads.test.js`).

## Pagination

- **Every list is cursor-paginated** (`src/utils/pagination.js`). `limit` defaults to 20, with a max of 50. Responses look like `{ data, meta: { nextCursor, limit } }`.
- **A cursor is an opaque `[sortValue, _id]` pair.** The next page is "after this pair" in the sort order, using the `(sortField, _id)` index, so deep pages stay as fast as the first. Items added meanwhile don't shift or repeat results.
- **Tampered cursors** get `400`.
- **Never use `skip`** for growing collections.

## Concurrency and integrity

- **Uniqueness comes from unique indexes,** never check-then-insert. Duplicate-key errors become `409`, or are handled specifically (for example "phone already linked", or "already liked" as a no-op).
- **First logins are single upserts** on a unique field.
- **OTP limits and attempts are single conditional updates.** Codes are consumed with one `deleteOne` (tested under concurrency).
- **Likes:** the unique `{ threadId, userId }` insert decides whether a like is new, and only then is `likes` incremented. Six simultaneous likes from one user count once (tested).
- **Counters are not transactional with their rows:** `likes` and `replyCount` are updated with `$inc` right after the insert or delete, not in one transaction. If a process died between the two writes, a count could be off by one. That's acceptable for display counters. The real rows (`thread_likes`, `thread_replies`) are the source of truth, and a counter can be recomputed from them. A transaction isn't worth its cost here.
- **No multi-document transactions are used anywhere.**

## Global Mongoose settings (`src/config/database.js`)

| Setting                    | Value   | Why                                                                                                  |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `strictQuery`              | `true`  | Filters on unknown fields are dropped                                                                |
| `sanitizeFilter`           | `true`  | Query operators in filters are neutralised unless the server wraps them with `mongoose.trusted(...)` |
| `bufferCommands`           | `false` | While disconnected, queries fail fast instead of hanging                                             |
| `autoCreate` / `autoIndex` | `false` | Indexes are created explicitly after connecting                                                      |

> ⚠️ **Developer rule:** wrap every operator _you_ write in a filter: `{ at: mongoose.trusted({ $lt: value }) }`, `{ slug: mongoose.trusted({ $in: ids }) }`, `{ $text: mongoose.trusted({ $search: q }) }`. Without it, the query silently matches nothing or throws a cast error. Never wrap client-supplied values. Update operators (`$set`, `$inc`) are unaffected.

## Connection lifecycle

- **Connect once at startup** with a 10 s server-selection timeout, then `ensureIndexes()` creates any missing index (never dropping or changing one).
- **If an existing index conflicts** with the schema, startup stops with "run `npm run migrate` first".
- **Connection events are logged.**
- **Graceful disconnect** on shutdown.

## Development data

`npm run seed` fills an **empty** development database with 14 sample listings and 4 threads (with replies). It skips any collection that has data, and refuses to run in production.

## Rules for new queries

1. **Bound the results:** cursor pagination, `limit` ≤ 50.
2. **Project only the returned fields,** and use `.lean()` for reads.
3. **No N+1:** batch with `$in`, or copy a small, stable field.
4. **Atomic operators** with conditions in the filter.
5. **Validate** with `explain("executionStats")`, and add a plan test for important list queries.
6. **New collections** get entries here, in `SCALABILITY.md` and in `SHARDING_STRATEGY.md`.
