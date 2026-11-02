# Wearistry API

The REST API for Wearistry, built with **Node.js, Express 5 and MongoDB (Mongoose)** in JavaScript, with types checked by TypeScript.

> **Status: milestone 1 (foundation).** The server, configuration, logging, security middleware, error handling, health checks, API docs and test setup are done. Feature endpoints (Google and phone login, listings, photo uploads, threads) come next. Until then, the frontend uses its own Next.js API routes.

## Requirements

- **Node.js 22.12 or later** (24 LTS recommended)
- **A MongoDB database**, either MongoDB Atlas or a local MongoDB

## Setup

```bash
cd backend
npm install
cp .env.example .env    # then set MONGODB_URI (see docs/ENVIRONMENT.md)
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

| Command                                   | What it does                                                    |
| ----------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                             | Start with `node --watch` and `.env`                            |
| `npm start`                               | Start for production                                            |
| `npm test`                                | Run all tests (in-memory MongoDB, never your real database)     |
| `npm run test:watch`                      | Re-run tests on change                                          |
| `npm run lint`                            | ESLint                                                          |
| `npm run format` / `npm run format:check` | Prettier write / check                                          |
| `npm run typecheck`                       | Strict type check of JS via JSDoc (`tsc -p jsconfig.json`)      |
| `npm run check`                           | Lint + formatting + type check + tests; run before every commit |

## Endpoints

| Method | Path                   | Description                                       |
| ------ | ---------------------- | ------------------------------------------------- |
| GET    | `/api/v1/health/live`  | Liveness: the process is running                  |
| GET    | `/api/v1/health/ready` | Readiness: the database is connected (503 if not) |

## Documentation

| Doc                                             | Read it for                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Folder structure, module anatomy, request flow, key decisions       |
| [API_CONVENTIONS.md](docs/API_CONVENTIONS.md)   | URLs, methods, status codes, response and error formats, pagination |
| [DATABASE.md](docs/DATABASE.md)                 | Connection, Mongoose settings, indexing, query rules, migrations    |
| [SECURITY.md](docs/SECURITY.md)                 | What's protected today and what's planned (auth, CSRF)              |
| [TESTING.md](docs/TESTING.md)                   | Test strategy, the in-memory database, how to write tests           |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)           | Every environment variable, dev vs prod, safe configuration         |
| [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | Naming, file layout, JSDoc types, error handling, review checklist  |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)             | Release steps, health checks, logging, scaling, rollback            |
