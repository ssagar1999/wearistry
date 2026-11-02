# Coding Standards

Write code that a new teammate can read once and change confidently. Clarity beats cleverness.

## Language and modules

- **Use modern JavaScript (ES2023) and ES modules** (`import`/`export`, `"type": "module"`). Always include the `.js` extension in relative imports.
- **Type with JSDoc, checked by TypeScript in strict mode** (`npm run typecheck`, configured in `jsconfig.json`). There's no build step: the code that runs is the code you read.
- **Annotate exported functions** with `@param` and `@returns` when the types aren't obvious. Use `@typedef` for shared shapes, and derive types from Zod with `z.infer<typeof schema>` instead of writing them twice.
- **Type Express handlers with `@param`:** `@param {import("express").Request} req` and so on. Using `@type {RequestHandler}` on function declarations breaks with TypeScript 7's checker.
- **Cast with care:** `/** @type {X} */ (value)` only where the type is truly known, for example `req.validated.body` after `validate()`. Never cast to silence a real error.

## Naming

| Thing                   | Convention                               | Example                                          |
| ----------------------- | ---------------------------------------- | ------------------------------------------------ |
| Files                   | kebab-case with a role suffix            | `product.service.js`, `rate-limit.middleware.js` |
| Variables and functions | camelCase; functions are verbs           | `listProducts`, `isDatabaseConnected`            |
| Classes                 | PascalCase                               | `ApiError`                                       |
| Constants               | UPPER_SNAKE_CASE for fixed config values | `JSON_BODY_LIMIT`, `SHUTDOWN_TIMEOUT_MS`         |
| Booleans                | `is`, `has`, `can` prefixes              | `isReady`, `hasPhone`                            |
| Mongoose models         | Singular PascalCase                      | `Product`, `User`                                |
| Routes                  | Plural kebab-case nouns                  | `/api/v1/swap-requests`                          |

## File organisation

- **Feature code lives in `src/modules/<feature>/`** with the files described in `ARCHITECTURE.md`. Add a file only when there's something to put in it.
- **Only truly cross-cutting code goes in `middleware/`, `utils/` or `config/`.** If only one module uses it, it lives in that module.
- **Keep each file focused on one responsibility.** As a guide, a file over about 200 lines usually holds two things.
- **No empty folders or placeholder files.**

## Layer rules

- **Routes** declare endpoints and middleware only.
- **Controllers** translate HTTP: read `req.validated`, call a service, and pick the status code. No database calls, no business rules.
- **Services** hold business rules. They take plain values (not `req`/`res`) and return plain values or throw `ApiError`.
- **Models** define the schema, indexes and timestamps.
- **Repositories** exist only where queries are complex enough to deserve a name.

## Error handling

- **Expected failures throw `ApiError`:** `throw ApiError.notFound("Listing not found.")`. The central error middleware formats the response.
- **Just `throw` in async handlers.** Express 5 forwards the error, so no try/catch or wrapper is needed.
- **Never use an empty `catch {}`.** If you catch, do one of three things: handle the error meaningfully, rethrow it, or log it with context and say why it's safe to continue.
- **Never send internal details to clients.** Messages in `ApiError` are written for users.
- **Validate at the edge** with Zod. Inside services, trust the validated types.
- **Read input in controllers with `validated(req, "body", schema)`.** It returns the exact parsed type with no casts.
- **Wrap operators you write in database filters** with `mongoose.trusted({ $gt: … })`. `sanitizeFilter` neutralises unmarked operators (see `DATABASE.md`). Never wrap client values.

## Readability

- **Comments explain _why_, not _what_.** A good comment records a decision, a trade-off or a non-obvious constraint.
- **Prefer early returns** over deep nesting, and small functions with clear names over clever one-liners.
- **No magic numbers.** Name them as constants, or put them in env config if they differ per environment.
- **No dead code or commented-out code.** Git keeps history.
- **Formatting is automatic** (Prettier, 110 columns), so don't argue about style in reviews.

## Before you open a pull request

```bash
npm run check   # lint + formatting + type check + tests must all pass
```

**Reviewers check for:**

- Correctness and edge cases, with tests that cover them.
- Layer boundaries respected (no queries in controllers, no `req` in services).
- All input validated, and ownership checked for user data.
- No secrets, tokens or personal data in code, logs or responses.
- Bounded queries with suitable indexes.
- Docs updated when behaviour, env variables or endpoints change. OpenAPI must match the endpoints that exist.
- Small, focused changes with a clear commit message explaining _why_.
