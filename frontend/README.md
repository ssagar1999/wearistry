# Wearistry web app

The website for Wearistry, India's easy pre-loved fashion marketplace: buy, sell and swap clothes, plus Threads for showing finds, asking for pieces and offering swaps. Prices in ₹, shipping within India only.

Built with **Next.js 15, TypeScript and Tailwind CSS**. This app is **only the frontend**: it has no database and no API routes. All data and logic (login, listings, photos, threads) live in the [backend API](../backend/README.md), which this app reaches through a proxy:

- The browser calls `/api/v1/*` on this site, and `next.config.ts` forwards those requests to the API, so cookies stay first-party.
- Server-rendered pages call the API directly (`src/lib/server-api.ts`), forwarding the visitor's cookie.
- Interactive parts (likes, replies, "Load more", saved items, selling) call `/api/v1` from the browser (`src/lib/api.ts`).

## Run it

Start the API first (see [backend/README.md](../backend/README.md)):

```bash
cd ../backend && npm run dev     # API on http://localhost:4000
```

Then, in another terminal:

```bash
npm install
npm run dev                      # web app on http://localhost:3000
```

Open http://localhost:3000. With an empty development database, run `npm run seed` in `backend/` for sample listings and threads.

To run everything (MongoDB, API and web app) with Docker instead, use `docker compose up --build` from the repo root. See [teachdockerfile.md](../teachdockerfile.md).

## Settings

Copy `.env.example` to `.env`. There are only two settings:

| Setting | Default | What it does |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://localhost:4000` | Where the API runs, as seen from this server. Used by the proxy (read at build time) and by server-side requests |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | `false` | `true` shows **Continue with Google** on the login page. Turn it on once the API has Google keys |

Login codes, Google keys, the database and photo storage are all configured in the API.

## Where things are

| Path | What |
| --- | --- |
| `src/app/` | Pages: home, explore, product, seller, saved, sell, threads, login, account, exchange |
| `src/components/` | UI pieces: product card, gallery, photo picker (compresses in the browser), thread feed, login flow |
| `src/lib/api.ts` | Browser calls to `/api/v1` (errors become readable messages) |
| `src/lib/server-api.ts` | Server-side calls to the API |
| `src/lib/session.ts` | "Who is logged in?" (asks the API's `/auth/me`) |
| `src/lib/data.ts` | API types and the fixed lists (cities, categories, sizes, conditions) |
| `src/lib/photo.ts` | Builds the photo URL for each size (480, 960 and 1600 px) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
