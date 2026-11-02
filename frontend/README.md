# Wearistry (कथा)

India's easy pre-loved fashion marketplace: buy, sell and swap clothes, plus Threads for showing finds, asking for pieces and offering swaps. Prices in ₹, shipping within India only.

Built with Next.js 15, TypeScript, Tailwind CSS, MongoDB (Mongoose), sharp for photo optimisation, MSG91 for phone OTP login and Amazon S3 + CloudFront for photo storage.

## Run it

**Dev mode.** Login and accounts come from the backend API, so start it first (see [backend/README.md](../backend/README.md)):

```bash
cd ../backend && npm run dev     # API on http://localhost:4000
```

Then, in another terminal:

```bash
npm install
npm run dev                      # web app on http://localhost:3000
```

Open http://localhost:3000. Listings and threads still live in this app until they move to the API; without `MONGODB_URI` they're kept in memory.

**With Docker** (the app plus a real MongoDB), from the repo root:

```bash
docker compose up --build
```

New to Docker? Start with [teachdockerfile.md](../teachdockerfile.md).

## Settings

Copy `.env.example` to `.env.local` and fill in what you need. Everything is optional in dev mode.

| Feature | Settings | Guide |
| --- | --- | --- |
| Database | `MONGODB_URI` | MongoDB Atlas connection string |
| Backend API | `API_INTERNAL_URL` (default `http://localhost:4000`) | Login and accounts are handled by the API; see [backend/README.md](../backend/README.md) |
| Google button | `NEXT_PUBLIC_GOOGLE_LOGIN=true` | Turn on once the backend has Google keys |
| Photo storage | `AWS_*`, `S3_BUCKET`, `S3_PUBLIC_URL` | [docs/S3_SETUP.md](docs/S3_SETUP.md) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
