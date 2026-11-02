# Deployment

> **Status (milestone 2):** the API runs in production mode (`npm start`) with health checks, JSON logs, graceful shutdown and versioned migrations. A backend Dockerfile and a compose service are planned for milestone 4. The repo's current `compose.yaml` runs only the frontend and MongoDB.

## Build

There is no compile step: the backend is plain JavaScript. A release is:

```bash
npm ci --omit=dev      # exact versions from package-lock.json, no dev tools
npm start              # node src/server.js
```

Before releasing, run the full check suite on a machine with dev dependencies installed:

```bash
npm ci && npm run check
npm audit --omit=dev   # production dependencies only
```

## Production environment

- **Node.js 22.12 or later** (24 LTS recommended), matching `engines` in `package.json`.
- **Required variables:** set `NODE_ENV=production`, `MONGODB_URI`, `AUTH_SECRET` (a new one, not the development value), `APP_URL` (your HTTPS web address), `CORS_ORIGINS` and `TRUST_PROXY_HOPS` to match your proxies, plus the MSG91 and Google keys. `OTP_DEV_CODES` must be off, and the server refuses to start otherwise. See `ENVIRONMENT.md`.
- **Google Cloud:** add `https://<your-domain>/api/v1/auth/google/callback` as an authorised redirect URI (see `GOOGLE_OAUTH_SETUP.md`).
- **No `.env` file in production.** `npm start` doesn't read one. Use the platform's secret settings.
- **HTTPS is terminated at the load balancer or proxy.** The API itself speaks HTTP on `PORT`.
- **Region:** use Mumbai (`ap-south-1`) or the closest region to the database, since most users are in India.

## Health checks

| Check     | Endpoint                   | Use it for                                                                                            |
| --------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Liveness  | `GET /api/v1/health/live`  | "Is the process alive?" If this fails repeatedly, **restart** the container                           |
| Readiness | `GET /api/v1/health/ready` | "Can it serve traffic?" A 503 means **stop routing traffic** here until it recovers. Don't restart it |

Health checks aren't written to the request log, so they don't drown out real traffic.

## Logging

- **One JSON object per line on stdout,** for example `{"level":30,"time":…,"service":"wearistry-api","req":{"id":"…","method":"GET","url":"/api/v1/…","ip":"…"},"res":{"statusCode":200},"responseTime":4,"msg":"request completed"}`.
- **Send stdout to a log tool** such as CloudWatch, Grafana Loki or Better Stack. Search by `req.id` to follow one request, and the same ID appears in the client's error response.
- **Levels:** 5xx responses log as `error` with the stack trace, 4xx as `warn`, everything else as `info`. Set `LOG_LEVEL=warn` to reduce volume.
- **Secrets and cookies are redacted automatically** (see `SECURITY.md`).

## Process lifecycle

- **Startup:** the server validates env, connects to MongoDB, creates missing indexes, then listens. Any failure exits with code 1, so the platform's restart policy and alerts kick in.
- **Shutdown:** SIGTERM or SIGINT stops new connections, lets open requests finish (up to 10 s), closes MongoDB, then exits 0. Give the platform a stop grace period of more than 10 s.
- **Crashes:** an unhandled rejection or uncaught exception is logged as `fatal` and exits with code 1, so a fresh instance starts.

## Scaling

- **The API is stateless**, apart from the in-memory rate-limit counters. To run more than one instance, move rate limiting (and later OTP codes) to Redis first. Otherwise each instance enforces its own limits.
- **Size the MongoDB connection pool** (`maxPoolSize`, Mongoose default 100) by instance count. Several instances × 100 can exceed small Atlas tiers.

## Deploying safely, and rolling back

0. **Run pending database migrations first,** from one machine: `npm run migrate:status`, then `npm run migrate` (see `MIGRATIONS.md`). The app refuses to start if a schema index changed and its migration hasn't run.
1. **Deploy only commits where `npm run check` passed.** Tag each release, for example `api-v0.1.0`.
2. **Use rolling or blue-green deploys.** New instances must pass readiness before receiving traffic, and old ones drain through graceful shutdown.
3. **Watch error rate, latency and logs** for a few minutes after each deploy.
4. **To roll back, redeploy the previous tag.** No build step means rollbacks are fast.
5. **Keep database changes backward-compatible** (see `DATABASE.md`), so the previous version still works with the current data. Never pair a rollback-sensitive release with a destructive migration.
6. **Before risky releases,** confirm Atlas backups or snapshots are enabled and recent.
