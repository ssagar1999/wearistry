# Environment Variables

All configuration comes from environment variables. They are validated **once at startup** by `src/config/env.js`. If anything is missing or invalid, the server prints every problem (never the values) and exits with code 1.

## Setup

```bash
cp .env.example .env    # then edit .env
```

- **Locally:** `npm run dev` loads `.env` automatically, using Node's built-in `--env-file`.
- **In production:** `npm start` does **not** read `.env`. Set real environment variables on the host or container instead.
- **Never commit `.env`.** It's git-ignored. Only `.env.example` (no real values) is committed.

## Variables

| Variable               | Required | Default                 | What it does                                                                                                                                                                                        |
| ---------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`          | **Yes**  | none                    | MongoDB connection string, starting with `mongodb://` or `mongodb+srv://`. Include the database name: `…mongodb.net/wearistry`                                                                      |
| `NODE_ENV`             | No       | `development`           | `development`, `test` or `production`. Production turns off the API docs, and development turns on readable logs                                                                                    |
| `PORT`                 | No       | `4000`                  | HTTP port (1–65535)                                                                                                                                                                                 |
| `CORS_ORIGINS`         | No       | `http://localhost:3000` | Comma-separated browser origins allowed to call the API with cookies, for example `https://wearistry.in,https://www.wearistry.in`. Each must be a full `http(s)://` URL with no trailing slash      |
| `LOG_LEVEL`            | No       | `info`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                                                                                                                                      |
| `TRUST_PROXY_HOPS`     | No       | `0`                     | How many proxies sit in front of the API (0–5). Use `1` behind the Next.js proxy or a single load balancer. Needed for correct client IPs in rate limiting; **too high lets clients fake their IP** |
| `RATE_LIMIT_WINDOW_MS` | No       | `60000`                 | Rate-limit window in milliseconds                                                                                                                                                                   |
| `RATE_LIMIT_MAX`       | No       | `120`                   | Requests allowed per IP per window, across all `/api/v1` routes                                                                                                                                     |

Variables for Google login, phone OTP, sessions and photo storage get added here as those features are built (milestones 2–3).

## Development vs production

|                        | Development                                         | Production                                                          |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| How variables load     | `.env` via `npm run dev`                            | Real environment variables (host or container settings)             |
| Logs                   | Readable (pino-pretty)                              | One JSON object per line, for log tools                             |
| API docs (`/api/docs`) | On                                                  | Off                                                                 |
| Restart on file change | Yes (`node --watch`)                                | No                                                                  |
| `CORS_ORIGINS`         | `http://localhost:3000`                             | Your real HTTPS domains only                                        |
| `TRUST_PROXY_HOPS`     | `0` (or `1` behind the local Next.js proxy)         | Matches your real proxy chain                                       |
| `MONGODB_URI`          | A dev database (local or a separate Atlas database) | The production database, with a **dedicated, least-privilege user** |

## Configuring safely

1. **Use different credentials per environment.** Never point development or tests at the production database.
2. **Give the production database user only the access it needs:** _readWrite_ on the `wearistry` database, not _atlasAdmin_.
3. **Restrict Atlas Network Access** to your servers' IPs. Avoid `0.0.0.0/0`.
4. **Use generated passwords.** If a password contains `@ : / ? # [ ]`, URL-encode it in the URI, or generate one without those characters.
5. **Rotate a secret immediately** if it ever leaks into chat, tickets, logs or git history.
