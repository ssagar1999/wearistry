# Scalability

How Wearistry's data and API are expected to grow, where the bottlenecks will appear, and what we'll do about each one, and when. The principle: **build for today's load, design so tomorrow's load doesn't need a rewrite.**

## Current setup

- **One MongoDB Atlas replica set** (Mumbai region recommended). No sharding. A well-indexed replica set comfortably handles millions of documents and thousands of queries per second.
- **One API instance.** The API itself is stateless, apart from the in-memory rate-limit counters noted below.

## Expected growth per collection

Rough estimates for planning. Revisit them with real numbers from Atlas metrics.

| Collection                                    | Reads                                                                 | Writes                        | Size at 1M users                                                                 | Growth shape                          |
| --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `users`                                       | **Very high** (2 point reads per authenticated request, via sessions) | Low (sign-ups, profile edits) | ~1M docs × ~0.5 KB ≈ 0.5 GB                                                      | Linear in sign-ups                    |
| `sessions`                                    | **Very high** (every authenticated request)                           | Medium (each login)           | Active sessions only (TTL), roughly 1–3 per active user, so ~1–3M docs × ~0.2 KB | Bounded by TTL; tracks _active_ users |
| `otp_challenges`                              | Medium                                                                | Medium–high at login peaks    | Only phones active in the last hour                                              | Bounded by TTL; tiny                  |
| `oauth_states`                                | Low                                                                   | Low                           | Only sign-ins in the last 10 minutes                                             | Bounded by TTL; tiny                  |
| `products`                                    | **Very high** (browsing, search)                                      | Medium                        | ~10–50 listings per seller, so possibly tens of millions over time               | Unbounded                             |
| `threads` / `thread_replies` / `thread_likes` | High                                                                  | Medium–high                   | Unbounded                                                                        | Unbounded, plus replies and likes     |

## Bottlenecks and plans

| #   | Risk                                                                     | When it bites                                                                       | Plan                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two reads per authenticated request** (session, then user)             | Very high request rates                                                             | Both are indexed point reads (sub-millisecond). If needed: cache session → user in Redis for 60 s, invalidating on logout and profile change. Not needed yet                                                                    |
| 2   | ~~Unbounded arrays in `threads`~~ **Fixed in milestone 3**               |                                                                                     | Replies and likes now live in `thread_replies` and `thread_likes`, with `likes` and `replyCount` counters kept by `$inc`. Old arrays are copied out by migration 002 and removed by a later cleanup migration                   |
| 3   | **In-memory rate limits** (API per-IP limiter)                           | More than one API instance: each enforces its own limit                             | Move counters to Redis (`rate-limit-redis`) before scaling out. OTP limits already live in MongoDB, so they work across instances today                                                                                         |
| 4   | **Server-rendered pages share the web server's IP** when calling the API | Many simultaneous visitors: server-side `/auth/me` calls could hit the per-IP limit | The frontend forwards `X-Forwarded-For` when an upstream proxy provides it. Finalise in milestone 4 with the real proxy chain (matching `TRUST_PROXY_HOPS`), or exempt authenticated internal calls                             |
| 5   | **Listing search**                                                       | Tens of millions of listings, or fuzzy or Hindi-English mixed search needs          | Browse is index-backed and cursor-paginated (tested with `explain`). Keyword search uses a MongoDB text index today. Move to **Atlas Search** for relevance, typo tolerance and facets when search quality or volume demands it |
| 6   | **Connection pool size**                                                 | Many API instances × 100 connections each                                           | Tune `maxPoolSize` per instance against the Atlas tier's connection limit                                                                                                                                                       |
| 7   | **Index build on a big collection**                                      | Adding an index to millions of documents                                            | Build it deliberately (Atlas UI or a migration) before deploying code that relies on it. See `MIGRATIONS.md`                                                                                                                    |

| 8 | **Image processing on the API** | Many sellers uploading at once (sharp is CPU-heavy) | Limited to 80 uploads per user per hour, and photos are pre-shrunk in the browser. If CPU becomes the bottleneck: move processing to a background worker or queue, or have browsers upload originals straight to S3 with a pre-signed URL and process them asynchronously |
| 9 | **Counter drift** (`likes`, `replyCount`) | A crash between a row write and its `$inc` | Rare, and off by one at most. A periodic job can recompute counts from `thread_likes` and `thread_replies` if ever needed |

| 10 | **`swap_requests` growth** | Heavy swapping | Each inbox read is one indexed page. Old requests can be archived by a job (move `declined` and `cancelled` ones older than 90 days) without changing the API |
| 11 | **Removed listings accumulate** (soft delete) | Many sellers removing listings | They cost index space but not query time (indexes lead with `status`). A cleanup job can hard-delete `removed` listings older than a retention period, after references are checked |

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
