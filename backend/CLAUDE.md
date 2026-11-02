# Backend instructions for Claude Code

These rules add to the repo-wide engineering standards in `../CLAUDE.md`. Read `docs/ARCHITECTURE.md` and `docs/CODING_STANDARDS.md` before changing code.

## Stack

- **Language:** JavaScript (ESM) with JSDoc types, checked by `tsc -p jsconfig.json` in strict mode. Use `.js` extensions in imports.
- **Server:** Express 5 (async errors are forwarded automatically, so don't add asyncHandler wrappers).
- **Data and validation:** Mongoose 9 and Zod 4.
- **Logging:** Pino.
- **Tests:** Vitest + Supertest + mongodb-memory-server.

## Commands (run in `backend/`)

- `npm run check`: lint + Prettier check + type check + tests. **Must pass before you say a change is done.** Report the real results.
- `npm run dev`: local server on :4000 (loads `.env`).
- `npm run migrate:status` / `npm run migrate`: database migrations (ask before running against a real database).
- `npx prettier --write .`: format after editing.

## Rules

- **Feature code goes in `src/modules/<feature>/`:** routes → controller → service → model, adding a repository only for complex queries.
- **Controllers read `req.validated`** (from the `validate` middleware), never raw `req.body` or `req.query`. Services never touch `req` or `res`.
- **Expected failures `throw ApiError.*`.** Never write an empty catch, and never send internal error details to clients.
- **Use strict Zod object schemas** (`.strict()`) for request bodies.
- **Every list query is bounded,** with cursor pagination (`limit` default 20, max 50). Add indexes only for real query patterns, and document them in `docs/DATABASE.md`.
- **Register every new endpoint in its module's `*.docs.js`.** Never document endpoints that don't exist.
- **Add or update tests for every change:** success, invalid input, 401/403, not found, duplicates and database failure where relevant.
- **Keep docs truthful:** update the relevant file in `docs/` and the endpoint table in `README.md` when behaviour, env variables or endpoints change. Mark unbuilt things as planned.
- **New env variable:** add it to the Zod schema in `src/config/env.js`, to `.env.example` and to `docs/ENVIRONMENT.md`.
- **Never read or print real secrets** from `.env`. Tests must never use a real database URI.
- **Before adding a dependency,** explain why it's needed. Prefer Node built-ins. Install scripts are denied by default (`allowScripts` in `package.json`).

## Database rules (non-negotiable)

Database scalability is one of this project's highest priorities. These are standing rules, not suggestions.

**Before creating or changing any model, collection, relationship, query, pagination or filter:**

1. Work out the real access patterns: how documents are created, read, updated and deleted, which queries are most frequent or expensive, and which collections will grow large or take heavy reads or writes. Don't design from the UI shape.
2. Decide **embed vs reference** deliberately. Embed only small, bounded data that belongs to one parent and is read with it. Reference anything unbounded, shared, many-to-many, or independently queried. **Never embed unbounded arrays** (comments, likes, logs, notifications, messages). Remember the 16 MB document limit.
3. Add indexes **only for real queries:** compound indexes in ESR order (Equality, Sort, Range), unique indexes for real uniqueness, partial indexes where values are optional, TTL indexes for expiring data. No redundant indexes; each one costs writes and memory. Validate important queries with `explain("executionStats")`.
4. **Bound every query:** cursor pagination for growing lists (`limit` ≤ 50), projections, `.lean()`, no N+1, no unbounded `populate`, never load whole collections.
5. **Integrity:** Zod at the edge; unique indexes rather than check-then-insert; atomic operators with conditions for counters and limits; never assume two operations are atomic; transactions only when multi-document atomicity is truly required.
6. **Future sharding:** give every important collection a documented candidate shard key (cardinality, distribution, hotspot risk, query targeting, unique-index implications). Don't default to `_id`, a hashed key, or a timestamp. Designing for sharding ≠ enabling it; stay on an indexed replica set until metrics justify more.
7. **Evolve safely:** backward-compatible changes (expand → migrate → contract), versioned and idempotent migrations in `migrations/` with a test, and never rename, remove or redefine a production field without a migration plan. Never run destructive operations on a real database without explicit approval.
8. **Mongoose:** small focused models, explicit documented indexes, no business logic in schemas, no unnecessary plugins. Server-written filter operators need `mongoose.trusted()` because `sanitizeFilter` is on.
9. **If a design raises a real scalability concern, explain it before implementing.** Prefer the simplest design that scales; don't add infrastructure today's needs don't justify.

**After any database change, update:** `docs/DATABASE.md` (collections, relationships, embed/reference decisions, indexes, query costs), `docs/SCALABILITY.md` (growth, bottlenecks), `docs/SHARDING_STRATEGY.md` (shard key) and `docs/MIGRATIONS.md` (if a migration was added). Explain decisions in plain language.

## Roadmap (agreed)

1. ~~Foundation~~ (done)
2. ~~Auth~~ (done): Google OIDC (PKCE, state, nonce), phone OTP, MongoDB sessions, Origin-check CSRF, `requireUser`; the frontend proxies `/api/v1/*` to the API.
3. ~~Products, uploads, threads~~ (done): cursor pagination, thread_replies and thread_likes collections, photo pipeline (sharp, S3 or local); the frontend has no DB or API routes. Pending: migrations 002 and 003 on Atlas (need approval), then a later 004 contract migration (legacy arrays and indexes).
4. Backend Dockerfile, compose service, deployment docs, and a new lesson in `../teachdockerfile.md`.
