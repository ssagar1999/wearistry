# Going live: what only you can do

Everything in the code is built and tested. These steps need **your** accounts, passwords or approval, so they can't be done for you. Do them in this order. The numbered guides have the details.

## 1. Rotate the database password (2 minutes, do this first)

The Atlas user `shu` has the password `shu`, and it has appeared in chat. Anyone who finds the connection string could read and change your data.

1. Open **cloud.mongodb.com** → your project → **Security → Database Access**.
2. Edit the user (or add a new one, then delete `shu`): **Autogenerate Secure Password**, copy it, and give the role **Read and write to any database** (for production, restrict it to the `wearistry` database).
3. Edit `backend/.env` yourself and replace only the password in `MONGODB_URI`:

   ```bash
   open -e ~/Desktop/app1/wearistry/backend/.env
   ```

4. Under **Security → Network Access**, remove `0.0.0.0/0` if it's there. Allow only your own IP for now, and your server's IP once you have one.
5. Check it still connects: `cd backend && npm run migrate:status` should print `Up to date.`

## 2. Accounts and keys

| What            | Where                                                                    | Guide                   | You'll add to `backend/.env`                                                                        |
| --------------- | ------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| Google sign-in  | Google Cloud Console                                                     | `GOOGLE_OAUTH_SETUP.md` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and `NEXT_PUBLIC_GOOGLE_LOGIN=true` in `frontend/.env`) |
| SMS login codes | DLT portal (TRAI) and MSG91. **DLT approval takes days, so start early** | `SMS_SETUP.md`          | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, and `OTP_DEV_CODES=false`                                    |
| Photo storage   | AWS: S3 bucket + CloudFront (Mumbai)                                     | `S3_SETUP.md`           | `AWS_*`, `S3_BUCKET`, `S3_PUBLIC_URL`                                                               |

Type secrets into the file yourself; never paste them into chat. After each one, run the API and test it: `npm run sms:test -- <your number>` for SMS, and a real login or upload for the others.

## 3. Clean up the database (needs your OK)

Atlas still has test data: the **"DB Test jacket"** listing, two test threads (**"DB Test thread"** and **"E2E thread via backend session"**), and the test users (phones `9876543210`, `9000000001`, `9812345670`, and similar). Tell me and I'll list exactly what I'll delete before removing anything.

Then migration **004** (`MIGRATIONS.md`): it removes the old reply and like arrays inside threads (after checking every one was copied) and 4 unused indexes. It deletes data, so first confirm an Atlas backup exists (**Backup** tab → take a snapshot), then:

```bash
cd backend && npm run migrate:status && npm run migrate
```

## 4. Production settings

Set these on your server (not in a file in git). The API refuses to start if they're wrong, which is intentional:

| Setting                                | Production value                                                 |
| -------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                             | `production`                                                     |
| `MONGODB_URI`                          | your Atlas string, with the new password                         |
| `AUTH_SECRET`                          | a **new** random value: `openssl rand -base64 32`                |
| `APP_URL`, `CORS_ORIGINS`              | your real `https://` address                                     |
| `TRUST_PROXY_HOPS`                     | the number of proxies in front of the API (1 behind the web app) |
| `OTP_DEV_CODES`                        | `false` (required)                                               |
| `S3_BUCKET`, `S3_PUBLIC_URL`, AWS keys | from step 2 (required)                                           |

Full list: `ENVIRONMENT.md`. Release steps: `DEPLOYMENT.md`.

## 5. Not built yet

| Missing                                                                             | Why                          | What I need from you                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Online payments** (the product page shows "coming soon")                          | Needs a payment provider     | Pick one (Razorpay is the usual choice in India) and create a test account. I'd then build orders, UPI/card checkout, webhooks, and seller payouts |
| **Chat between buyer and seller**                                                   | Not designed yet             | Whether it should be real-time, and whether swap contact-sharing already covers the need                                                           |
| **A deployable production setup** (a `compose.prod.yaml` with HTTPS, and AWS steps) | Needs your server and domain | Where to host (a single AWS server in Mumbai is the simplest) and your domain name                                                                 |
| **Photo editing on a listing**                                                      | Not built                    | Say if you want it                                                                                                                                 |

## 6. Deploy on Render

Once steps 1, 2 and 4 are done, follow [RENDER_DEPLOY.md](RENDER_DEPLOY.md). It uses `render.yaml` in the repo root.
