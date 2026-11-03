# Deploying on Render

This puts Wearistry online with two Render services built from the repo's Dockerfiles: `wearistry-api` and `wearistry` (the web app). The database stays on MongoDB Atlas, and photos go to S3. `render.yaml` in the repo root describes both services.

**Cost:** two **Starter** instances (about $7 each per month). The free plan sleeps after 15 minutes and can't run the pre-deploy migration step, so it's not suitable for showing people.

## Before you start

You need these from [GO_LIVE.md](GO_LIVE.md); the API won't start without them:

1. **A new Atlas password** (the old one was exposed) and the new `MONGODB_URI`.
2. **S3 + CloudFront** ([S3_SETUP.md](S3_SETUP.md)): `S3_BUCKET`, `S3_PUBLIC_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
3. **A way to log in:** MSG91 ([SMS_SETUP.md](SMS_SETUP.md)) or Google ([GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)). Dev-mode codes are blocked in production, so without one of these nobody can sign in.

## Steps

1. Push the repo to GitHub (already done for `ssagar1999/wearistry`).
2. On [render.com](https://render.com): **New → Blueprint**, connect the repo, and pick the `main` branch. Render reads `render.yaml`.
3. It asks for the secret values (`sync: false` in the file). Paste them in; leave MSG91 or Google blank if you don't use them. Pairs must be both set or both empty (`MSG91_AUTH_KEY` with `MSG91_TEMPLATE_ID`, `GOOGLE_CLIENT_ID` with `GOOGLE_CLIENT_SECRET`).
4. **If a service name is taken,** rename it in the Blueprint screen, then update `APP_URL`, `CORS_ORIGINS` (API) and `API_INTERNAL_URL` (web) to the real URLs. Change `API_INTERNAL_URL` on the web service and redeploy it, because the `/api/v1` proxy target is baked in at build time.
5. **Atlas Network Access:** Render shows its outbound IP ranges for your region under the service's **Connect → Outbound**. Add them in Atlas (**Security → Network Access**). If that's too fiddly for now, `0.0.0.0/0` works with a strong password, but tighten it later.
6. Click **Apply**. The API builds, runs `node scripts/migrate.js up` (applies pending migrations, including 005), then starts. Open `https://wearistry.onrender.com`.
7. **Google login:** add `https://wearistry.onrender.com/api/v1/auth/google/callback` as a redirect URI in Google Cloud, then set `NEXT_PUBLIC_GOOGLE_LOGIN=true` on the web service and redeploy it.

## Check it worked

- `https://wearistry-api.onrender.com/api/v1/health/ready` returns `ok` with the database connected.
- The home page loads, **Log in** sends a code, and a test listing with a photo appears on Explore. Its photo URL should start with your `S3_PUBLIC_URL`.
- The sample listings (`npm run seed`) are **not** added automatically in production. Real users start with an empty marketplace. To show a populated one, ask me to prepare a one-off seed step.

## Things to know

- **Migrations run on every deploy.** They are idempotent and run from one place (the pre-deploy step), as `MIGRATIONS.md` requires. Migration 004 (it deletes the old thread arrays) will also run on the first deploy. **Take an Atlas backup before you click Apply.**
- **Rate limits and `TRUST_PROXY_HOPS`.** Visitors reach the API through Render's load balancer and then the web server, so the file sets `2`. If login limits seem shared across people, check the `ip` in the API logs; if every request shows the web server's address, raise the value by one.
- **Region:** Singapore is Render's closest region to India. Put Atlas in Mumbai (`ap-south-1`) or Singapore to keep the database close.
- **HTTPS** is included, and you can add your own domain under each service's **Settings → Custom Domains**. Update `APP_URL`, `CORS_ORIGINS` and the Google redirect URI when you do.
- **Logs:** each service's **Logs** tab shows the API's JSON lines. Search by `req.id`.
