# Wearistry API

The REST API for Wearistry, built with **Node.js, Express 5 and MongoDB (Mongoose)** in JavaScript, with types checked by TypeScript.

> **Status: milestone 3.** The API owns all data: login (phone OTP, Google), sessions, profiles, listings with search and cursor pagination, photo uploads (resized, location stripped, S3 or local), and Threads (feed, replies, likes). The web app is purely a frontend that calls this API through its `/api/v1` proxy.

## Requirements

- **Node.js 22.12 or later** (24 LTS recommended)
- **A MongoDB database**, either MongoDB Atlas or a local MongoDB

## Setup

```bash
cd backend
npm install
cp .env.example .env    # then set MONGODB_URI and AUTH_SECRET (see docs/ENVIRONMENT.md)
npm run migrate         # bring the database schema up to date (see docs/MIGRATIONS.md)
npm run seed            # optional: sample listings and threads for an empty dev database
```

## Run

```bash
npm run dev     # development: auto-restarts on changes, readable logs, loads .env
npm start       # production mode: reads real environment variables, JSON logs
```

The API listens on `http://localhost:4000` by default. To check it:

```bash
curl http://localhost:4000/api/v1/health/ready
```

You should get `{"data":{"status":"ok","checks":{"database":"up"}}}`.

The interactive API docs are at **http://localhost:4000/api/docs** (outside production only).

## Scripts

| Command                                      | What it does                                                    |
| -------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                                | Start with `node --watch` and `.env`                            |
| `npm start`                                  | Start for production                                            |
| `npm test`                                   | Run all tests (in-memory MongoDB, never your real database)     |
| `npm run test:watch`                         | Re-run tests on change                                          |
| `npm run lint`                               | ESLint                                                          |
| `npm run format` / `npm run format:check`    | Prettier write / check                                          |
| `npm run typecheck`                          | Strict type check of JS via JSDoc (`tsc -p jsconfig.json`)      |
| `npm run check`                              | Lint + formatting + type check + tests; run before every commit |
| `npm run migrate` / `npm run migrate:status` | Apply / list pending database migrations                        |
| `npm run sms:test -- 98765XXXXX`             | Send one real test SMS through MSG91                            |
| `npm run seed`                               | Fill an empty development database with sample data             |

## Endpoints

| Method        | Path                           | Description                                                           |
| ------------- | ------------------------------ | --------------------------------------------------------------------- |
| GET           | `/api/v1/health/live`          | Liveness: the process is running                                      |
| GET           | `/api/v1/health/ready`         | Readiness: the database is connected (503 if not)                     |
| POST          | `/api/v1/auth/otp/send`        | Send a 6-digit login code to an Indian mobile number                  |
| POST          | `/api/v1/auth/otp/verify`      | Log in with the code (or add a verified phone to the current account) |
| GET           | `/api/v1/auth/google/start`    | Start Google sign-in (browser redirect)                               |
| GET           | `/api/v1/auth/google/callback` | Google returns here; sets the session                                 |
| GET           | `/api/v1/auth/me`              | The logged-in user                                                    |
| POST          | `/api/v1/auth/logout`          | Log out                                                               |
| PATCH         | `/api/v1/users/me`             | Update name and city                                                  |
| GET           | `/api/v1/products`             | Browse and search listings (cursor-paginated), or fetch by `ids`      |
| GET           | `/api/v1/products/:id`         | One listing                                                           |
| POST          | `/api/v1/products`             | Create a listing (verified phone required)                            |
| POST          | `/api/v1/uploads`              | Upload one photo → URL                                                |
| GET           | `/api/v1/media/:file`          | Local photo sizes (development)                                       |
| GET           | `/api/v1/threads`              | Community feed (cursor-paginated)                                     |
| POST          | `/api/v1/threads`              | Post a thread                                                         |
| POST / DELETE | `/api/v1/threads/:id/like`     | Like / unlike                                                         |
| GET / POST    | `/api/v1/threads/:id/replies`  | List / add replies                                                    |

Details and examples: `/api/docs` and [API_CONVENTIONS.md](docs/API_CONVENTIONS.md).

## Documentation

| Doc                                                 | Read it for                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Folder structure, module anatomy, request flow, key decisions       |
| [API_CONVENTIONS.md](docs/API_CONVENTIONS.md)       | URLs, methods, status codes, response and error formats, pagination |
| [DATABASE.md](docs/DATABASE.md)                     | Collections, relationships, indexes, query costs, integrity rules   |
| [SCALABILITY.md](docs/SCALABILITY.md)               | Growth estimates, bottlenecks, scaling path                         |
| [SHARDING_STRATEGY.md](docs/SHARDING_STRATEGY.md)   | Future shard key per collection and why                             |
| [MIGRATIONS.md](docs/MIGRATIONS.md)                 | Versioned schema migrations and safe change process                 |
| [SECURITY.md](docs/SECURITY.md)                     | Auth, sessions, CSRF, rate limits, validation, data exposure        |
| [TESTING.md](docs/TESTING.md)                       | Test strategy, the in-memory database, how to write tests           |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)               | Every environment variable, dev vs prod, safe configuration         |
| [CODING_STANDARDS.md](docs/CODING_STANDARDS.md)     | Naming, file layout, JSDoc types, error handling, review checklist  |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                 | Release steps, health checks, logging, scaling, rollback            |
| [GOOGLE_OAUTH_SETUP.md](docs/GOOGLE_OAUTH_SETUP.md) | Creating the Google OAuth client                                    |
| [SMS_SETUP.md](docs/SMS_SETUP.md)                   | MSG91 and DLT setup for SMS codes                                   |
| [S3_SETUP.md](docs/S3_SETUP.md)                     | S3 bucket, CloudFront and IAM for photo storage                     |
