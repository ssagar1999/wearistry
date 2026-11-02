# Scalability

How Wearistry's data and API are expected to grow, where the bottlenecks will appear, and what we'll do about each one, and when. The principle: **build for today's load, design so tomorrow's load doesn't need a rewrite.**

## Current setup

- **One MongoDB Atlas replica set** (Mumbai region recommended). No sharding. A well-indexed replica set comfortably handles millions of documents and thousands of queries per second.
- **One API instance.** The API itself is stateless, apart from the in-memory rate-limit counters noted below.

## Expected growth per collection

Rough estimates for planning. Revisit them with real numbers from Atlas metrics.

| Collection       | Reads                                                                 | Writes                        | Size at 1M users                                                                 | Growth shape                          |
| ---------------- | --------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `users`          | **Very high** (2 point reads per authenticated request, via sessions) | Low (sign-ups, profile edits) | ~1M docs × ~0.5 KB ≈ 0.5 GB                                                      | Linear in sign-ups                    |
| `sessions`       | **Very high** (every authenticated request)                           | Medium (each login)           | Active sessions only (TTL), roughly 1–3 per active user, so ~1–3M docs × ~0.2 KB | Bounded by TTL; tracks _active_ users |
| `otp_challenges` | Medium                                                                | Medium–high at login peaks    | Only phones active in the last hour                                              | Bounded by TTL; tiny                  |
| `oauth_states`   | Low                                                                   | Low                           | Only sign-ins in the last 10 minutes                                             | Bounded by TTL; tiny                  |
| `products` (M3)  | **Very high** (browsing, search)                                      | Medium                        | ~10–50 listings per seller, so possibly tens of millions over time               | Unbounded                             |
| `threads` (M3)   | High                                                                  | Medium–high                   | Unbounded                                                                        | Unbounded, plus replies and likes     |

## Bottlenecks and plans

| #   | Risk                                                                                    | When it bites                                                                                                              | Plan                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two reads per authenticated request** (session, then user)                            | Very high request rates                                                                                                    | Both are indexed point reads (sub-millisecond). If needed: cache session → user in Redis for 60 s, invalidating on logout and profile change. Not needed yet                                                                |
| 2   | **Unbounded arrays in `threads`** (`replies`, `likedBy`), today written by the frontend | A popular thread gets thousands of replies or likes. Documents grow, every update rewrites more, and the 16 MB limit looms | **Fix in milestone 3:** `thread_replies` (cursor-paginated by `threadId, createdAt`) and `thread_likes` (unique `{ threadId, userId }`) collections, with `replyCount` and `likeCount` counters kept atomically with `$inc` |
| 3   | **In-memory rate limits** (API per-IP limiter)                                          | More than one API instance: each enforces its own limit                                                                    | Move counters to Redis (`rate-limit-redis`) before scaling out. OTP limits already live in MongoDB, so they work across instances today                                                                                     |
| 4   | **Server-rendered pages share the web server's IP** when calling the API                | Many simultaneous visitors: server-side `/auth/me` calls could hit the per-IP limit                                        | The frontend forwards `X-Forwarded-For` when an upstream proxy provides it. Finalise in milestone 4 with the real proxy chain (matching `TRUST_PROXY_HOPS`), or exempt authenticated internal calls                         |
| 5   | **Listing search and browse** (M3)                                                      | Tens of millions of listings                                                                                               | Compound indexes per real filter (e.g. `{ city, status, createdAt, _id }`), cursor pagination, and MongoDB Atlas Search for text search instead of regex                                                                    |
| 6   | **Connection pool size**                                                                | Many API instances × 100 connections each                                                                                  | Tune `maxPoolSize` per instance against the Atlas tier's connection limit                                                                                                                                                   |
| 7   | **Index build on a big collection**                                                     | Adding an index to millions of documents                                                                                   | Build it deliberately (Atlas UI or a migration) before deploying code that relies on it. See `MIGRATIONS.md`                                                                                                                |

## Scaling path, in order

Do each step only when metrics show the need:

1. **Indexes and query fixes.** Check slow queries with Atlas Performance Advisor and `explain()`. This is usually enough for a long time.
2. **A larger Atlas tier.** Vertical scaling is the cheapest operational win.
3. **More API instances** behind a load balancer, after moving rate limits to Redis (risk 3).
4. **Read preference `secondaryPreferred`** for tolerant, read-heavy, non-personal queries such as public listing browse. Never for auth or anything read right after a write.
5. **Caching** of hot public reads (listing pages) and possibly session lookups (risk 1).
6. **Sharding** specific large collections (`products`, `thread_replies`), following `SHARDING_STRATEGY.md`. This is the last step, not the first.

## Review checklist for every schema change

From the project's database rules; answer these in the PR:

1. Can this collection grow without a predictable limit?
2. Are any arrays unbounded?
3. What are the most common reads and writes?
4. Which indexes support them?
5. Does it work with millions of documents?
6. Could it be sharded later, and on what key?
7. Could it create write hotspots?
8. Does it need expensive joins or excessive duplication?
9. Is there a simpler design?
