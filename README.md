# Wearistry (कथा)

India's easy pre-loved fashion marketplace: buy, sell and swap clothes, plus Threads for showing finds, asking for pieces and offering swaps. Prices in ₹, shipping within India only.

## Repository layout

| Folder | What it is | Start here |
| --- | --- | --- |
| [`frontend/`](frontend/) | Next.js 15 web app (TypeScript, Tailwind). Frontend only; talks to the API | [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | Express 5 API (Node.js, MongoDB): all data and logic (login, listings, photos, threads) | [backend/README.md](backend/README.md) |

## Run it

**With Docker** (everything in one command; needs Docker Desktop):

```bash
docker compose up --build
```

Then open http://localhost:3000. Sample data: `docker compose run --rm api node scripts/seed.js`. New to Docker? [teachdockerfile.md](teachdockerfile.md) explains every step.

**Without Docker:** start the API (`cd backend && npm run dev`), then the web app (`cd frontend && npm run dev`). See each folder's README.

Other files at the root:

- `compose.yaml`: runs MongoDB, the API and the web app together (see [teachdockerfile.md](teachdockerfile.md))
- `CLAUDE.md`: engineering standards for this repo
