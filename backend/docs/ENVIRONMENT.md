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

| Variable               | Required | Default                          | What it does                                                                                                                                                                                        |
| ---------------------- | -------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`          | **Yes**  | none                             | MongoDB connection string, starting with `mongodb://` or `mongodb+srv://`. Include the database name: `…mongodb.net/wearistry`                                                                      |
| `NODE_ENV`             | No       | `development`                    | `development`, `test` or `production`. Production turns off the API docs, and development turns on readable logs                                                                                    |
| `PORT`                 | No       | `4000`                           | HTTP port (1–65535)                                                                                                                                                                                 |
| `CORS_ORIGINS`         | No       | `http://localhost:3000`          | Comma-separated browser origins allowed to call the API with cookies, for example `https://wearistry.in,https://www.wearistry.in`. Each must be a full `http(s)://` URL with no trailing slash      |
| `LOG_LEVEL`            | No       | `info`                           | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                                                                                                                                      |
| `LOG_PRETTY`           | No       | on in development, off otherwise | `true` prints readable, coloured logs (needs the `pino-pretty` dev dependency); `false` prints JSON. The Docker image has no dev dependencies, so compose sets `false`                              |
| `TRUST_PROXY_HOPS`     | No       | `0`                              | How many proxies sit in front of the API (0–5). Use `1` behind the Next.js proxy or a single load balancer. Needed for correct client IPs in rate limiting; **too high lets clients fake their IP** |
| `RATE_LIMIT_WINDOW_MS` | No       | `60000`                          | Rate-limit window in milliseconds                                                                                                                                                                   |
| `RATE_LIMIT_MAX`       | No       | `120`                            | Requests allowed per IP per window, across all `/api/v1` routes                                                                                                                                     |

### Login and sessions

| Variable                                   | Required             | Default                 | What it does                                                                                                                                                                                               |
| ------------------------------------------ | -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                              | **Yes**              | none                    | At least 32 random characters (`openssl rand -base64 32`). Keys the HMAC that hashes OTP codes and OAuth `state`. Rotating it cancels pending codes and in-progress Google sign-ins, not existing sessions |
| `APP_URL`                                  | No                   | `http://localhost:3000` | Public URL of the web app. The Google callback (`APP_URL/api/v1/auth/google/callback`) and post-login redirects are built from it, and it's always allowed by the Origin (CSRF) check                      |
| `SESSION_TTL_DAYS`                         | No                   | `30`                    | How long a login lasts (1–90 days)                                                                                                                                                                         |
| `AUTH_RATE_LIMIT_MAX`                      | No                   | `30`                    | Per-IP requests to login endpoints per 15 minutes                                                                                                                                                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No (both or neither) | unset                   | Google sign-in. If unset, `/auth/google/start` returns 503. Setup: `GOOGLE_OAUTH_SETUP.md`                                                                                                                 |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`      | No (both or neither) | unset                   | SMS for phone login codes. If unset and `OTP_DEV_CODES` is off, sending a code returns 503. Setup: `SMS_SETUP.md`                                                                                          |
| `OTP_DEV_CODES`                            | No                   | `false`                 | `true` returns login codes in the API response instead of sending SMS. **Refused in production.** Use it in local development only                                                                         |

### Photo storage

| Variable                                     | Required                                | Default         | What it does                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`, `S3_PUBLIC_URL`                 | **Yes in production** (both or neither) | unset           | Store photos in S3 and serve them from `S3_PUBLIC_URL` (your CloudFront domain, no trailing slash). Unset in development, so photos go to `UPLOAD_DIR`. Setup: `S3_SETUP.md` |
| `AWS_REGION`                                 | No                                      | `ap-south-1`    | S3 region (Mumbai)                                                                                                                                                           |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | With S3                                 | unset           | Read directly by the AWS SDK. Use an IAM user that can only `s3:PutObject` to `photos/*`                                                                                     |
| `S3_ENDPOINT`                                | No                                      | unset           | Only for S3-compatible stores other than AWS (MinIO, Cloudflare R2)                                                                                                          |
| `UPLOAD_DIR`                                 | No                                      | `.data/uploads` | Local photo folder in development (git-ignored), served at `/api/v1/media/…`                                                                                                 |

The web app (`../frontend`) has only two settings: `API_INTERNAL_URL` (where it proxies `/api/v1`, default `http://localhost:4000`) and `NEXT_PUBLIC_GOOGLE_LOGIN=true` to show the Google button.

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
