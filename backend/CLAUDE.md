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

## Roadmap (agreed)

1. ~~Foundation~~ (done)
2. Auth: Google OAuth2/OIDC via `openid-client` (PKCE, state, nonce), phone OTP moved from the frontend, MongoDB sessions in an httpOnly cookie, Origin-check CSRF, `requireUser`. The frontend proxies `/api/v1/*` to the API.
3. Products, uploads (multer + sharp + S3) and threads move from `../frontend/src/lib`, with cursor pagination. Then remove the Next.js API routes.
4. Backend Dockerfile, compose service, deployment docs, and a new lesson in `../teachdockerfile.md`.
