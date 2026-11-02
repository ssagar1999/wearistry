# Wearistry (कथा)

India's easy pre-loved fashion marketplace: buy, sell and swap clothes, plus Threads for showing finds, asking for pieces and offering swaps. Prices in ₹, shipping within India only.

Built with Next.js 15, TypeScript, Tailwind CSS, MongoDB (Mongoose), sharp for photo optimisation, MSG91 for phone OTP login and Amazon S3 + CloudFront for photo storage.

## Run it

**Quick dev mode** (no database needed; data lives in memory, and login codes show on screen):

```bash
npm install
npm run dev
```

Open http://localhost:3000.

**With Docker** (the app plus a real MongoDB):

```bash
docker compose up --build
```

New to Docker? Start with [teachdockerfile.md](teachdockerfile.md).

## Settings

Copy `.env.example` to `.env.local` and fill in what you need. Everything is optional in dev mode.

| Feature | Settings | Guide |
| --- | --- | --- |
| Database | `MONGODB_URI` | MongoDB Atlas connection string |
| Login cookies | `AUTH_SECRET` | Required in production |
| SMS login codes | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | [docs/SMS_SETUP.md](docs/SMS_SETUP.md) |
| Photo storage | `AWS_*`, `S3_BUCKET`, `S3_PUBLIC_URL` | [docs/S3_SETUP.md](docs/S3_SETUP.md) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run sms:test -- 98765XXXXX` | Sends one test OTP SMS through MSG91 |
