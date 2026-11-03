# Sharding Strategy

**Sharding is not enabled, and shouldn't be until the numbers demand it.** This document records, for every important collection, how it _would_ be sharded, so that today's schema and queries don't make that impossible later.

## When to consider sharding

Shard a collection only when at least one of these is true, and cheaper options (indexes, a bigger tier, caching, archiving) have been tried:

- **Data size:** its working set (data and indexes in regular use) no longer fits in RAM on the largest practical Atlas tier.
- **Writes:** its write throughput saturates a single primary.
- **Location:** data must be pinned to regions (zone sharding).

Shard **collections**, not the whole database. Small collections stay unsharded on the primary shard.

## What makes a good shard key here

- **High cardinality and even distribution:** many distinct values, spread evenly.
- **No monotonic keys for heavy writes:** a timestamp or ObjectId alone sends all inserts to one shard (a hotspot).
- **Query targeting:** common queries include the shard key, so they go to one shard instead of all of them.
- **Uniqueness:** MongoDB can only enforce a unique index across shards if the index starts with the shard key. This drives several decisions below.
- **Hashed vs ranged:** hashed spreads writes perfectly but makes range scans on that key scatter to every shard. Ranged keeps ranges local but needs a naturally spread-out key.
- **Hard to change:** resharding is possible (MongoDB 5.0+) but expensive, so choose deliberately.
- **Not multi-tenant:** Wearistry has no tenant or organisation concept, so `tenantId` doesn't apply. Revisit if that ever changes.

## Per collection

### `sessions`: candidate `{ tokenHash: 1 }` (ranged)

|                            |                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Growth / writes            | Active sessions only (TTL). One insert per login, one point read per authenticated request                                                                                                      |
| Main queries               | `findOne({ tokenHash })` and `deleteOne({ tokenHash })`                                                                                                                                         |
| Why this key               | `tokenHash` is a SHA-256 of a random token, so it's **already uniformly random**. A ranged key on it spreads inserts evenly without hashing again, and every query includes it (fully targeted) |
| Cardinality / distribution | Unique per document; even                                                                                                                                                                       |
| Hotspot risk               | None: values aren't monotonic                                                                                                                                                                   |
| Unique index               | `tokenHash` _is_ the shard key, so uniqueness keeps working                                                                                                                                     |
| Caveat                     | A future "log out everywhere" (`deleteMany({ userId })`) would scatter to all shards. It's rare, so that's acceptable                                                                           |
| Likelihood of needing it   | Low. Even at millions of active sessions this is a few GB                                                                                                                                       |

### `users`: keep unsharded; if ever needed, `{ uid: "hashed" }` plus an identities collection

|                       |                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Growth / writes       | Linear in sign-ups; low write rate; very high point-read rate                                                                                                                                                                                                                                                                             |
| Main queries          | By `uid` (every request), by `phone` (OTP login), by `googleSub` (Google login)                                                                                                                                                                                                                                                           |
| Why stay unsharded    | About 1M users is roughly 0.5 GB. A replica set handles this for a very long time                                                                                                                                                                                                                                                         |
| If it must be sharded | `{ uid: "hashed" }` spreads data and targets the hot `uid` lookups. **But** the unique indexes on `phone` and `googleSub` can't be enforced across shards unless they start with the shard key                                                                                                                                            |
| Plan for that day     | Move login identities into a `user_identities` collection: `{ _id: "phone:9876543210" or "google:<sub>", userId }`. Shard it on `_id`, so uniqueness is natural and lookups are targeted. Then login becomes: identity lookup → `users` by `uid`. Our code already isolates these lookups in `user.service.js`, so the change stays local |
| Hotspot risk          | None with a hashed `uid` (UUIDs are random anyway)                                                                                                                                                                                                                                                                                        |

### `otp_challenges`: candidate `{ phone: "hashed" }` (unlikely to be needed)

|                 |                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Growth / writes | Only phones active in the last hour (TTL); write bursts at peak login times                                                                               |
| Main queries    | Every operation filters on `phone` (targeted)                                                                                                             |
| Why this key    | The unique `phone` index can stay unique as the shard key. Hashed avoids clustering, since Indian mobile numbers share prefixes (6–9) and operator series |
| Hotspot risk    | Low                                                                                                                                                       |

### `oauth_states`: not worth sharding

Tiny and short-lived (10-minute TTL). If ever needed, use `{ stateHash: 1 }`: random values, and the only query uses it.

### `products`: candidate `{ _id: "hashed" }` vs `{ sellerId: 1, _id: 1 }` (decide with real query data)

|              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Growth       | Unbounded; possibly tens of millions over time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Main queries | Browse and search by city, category and recency (cross-seller); a seller's own listings; a single listing by ID                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Options      | **`{ _id: "hashed" }`:** even writes, targeted single-listing reads; browse queries scatter to all shards (acceptable if they're index-backed and limited to 20–50 results). **`{ sellerId: 1, _id: 1 }`:** seller pages and shop management are targeted; very large sellers could create jumbo chunks. **`{ state: 1, … }` or `{ city: 1, … }`:** good locality for location browsing (the main filter), but low cardinality (a few dozen states, a handful of big cities) and uneven distribution (Maharashtra, Delhi hotspots) |
| Leaning      | `{ _id: "hashed" }` for simplicity, unless seller-scoped queries dominate. Not a timestamp or ObjectId as a _ranged_ key, which would mean monotonic inserts and a hotspot                                                                                                                                                                                                                                                                                                                                                         |

### `threads`, `thread_replies` and `thread_likes`

| Collection       | Candidate                    | Why                                                                                                                                               |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threads`        | `{ _id: "hashed" }`          | Feed reads scatter but are bounded. Single-thread reads are targeted                                                                              |
| `thread_replies` | `{ threadId: 1, _id: 1 }`    | Replies are always read per thread, so that's targeted. A viral thread's replies stay together, which is good for reading (bounded by pagination) |
| `thread_likes`   | `{ threadId: 1, userId: 1 }` | Matches the unique "one like per user" index, so uniqueness survives sharding                                                                     |

### `swap_requests`: candidate `{ ownerId: "hashed" }` (unlikely to be needed soon)

|                 |                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Growth / writes | Low compared with listings and threads. Each request is a few writes in its lifetime                                                                                                                                                                                                                                                                      |
| Main queries    | The owner's inbox (`ownerId`) and the requester's sent box (`requesterId`)                                                                                                                                                                                                                                                                                |
| Why this key    | The received inbox is the more frequent read, and it targets one shard. A hashed key spreads owners evenly (UUIDs are random anyway)                                                                                                                                                                                                                      |
| Trade-off       | The sent box (`requesterId`) is scatter-gather, bounded by `limit`. Acceptable                                                                                                                                                                                                                                                                            |
| Unique index    | `{ requesterId, productId }` (partial) can't be enforced across shards unless it begins with the shard key. On that day, either shard on `{ requesterId: "hashed" }` instead (then the _received_ inbox scatters), or enforce the one-pending rule on a small separate `swap_locks` collection keyed by `requesterId:productId`. Decide with real traffic |
| Hotspot risk    | None: no monotonic key                                                                                                                                                                                                                                                                                                                                    |

**Note on `products` unique slug:** the `slug` unique index can't be enforced across shards unless it's the shard key prefix. Options on that day: shard on `{ slug: "hashed" }` (single-listing reads stay targeted, and browse scatters as above), or keep slug uniqueness probabilistic (slugs include time plus random bytes) and drop the unique constraint. Decide together with the shard key.

**Note on the browse indexes:** today's compound indexes begin with `status` (low cardinality). That's right for a single replica set, where they serve the queries perfectly. If `products` is sharded, they stay as secondary indexes on each shard, and browse queries become scatter-gather (bounded by `limit`).

## Rules this imposes on code today

1. **Every query on a large collection should include its candidate shard key where natural.** For example, sessions by `tokenHash`, replies by `threadId`.
2. **Don't add new global unique constraints** to large collections without checking this document. A unique field that isn't the shard key prefix becomes impossible to enforce after sharding.
3. **Don't rely on ObjectId or insert order for cross-document ordering at scale.** Sort explicitly on `{ createdAt, _id }`.
4. **Update this document** whenever a collection is added or its access pattern changes.
