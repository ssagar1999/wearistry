# Learn Docker with Wearistry

This file teaches Docker step by step, using our own app. Each lesson says **why** you do something, **what command** to run, and **when** to run it. New lessons get added at the bottom as the project grows (see the [Lesson log](#lesson-log)).

> Status: the Docker files are written for the whole stack (MongoDB, the API and the web app). Each container's steps were rehearsed on this Mac without Docker: a production-only install, migrations, the seed, health checks, and the web app's standalone build talking to the API. The `docker` commands themselves haven't been run yet, because Docker wasn't installed. Lesson 3 is your first real run, and if anything breaks, that's a lesson too.

---

## Lesson 1 — What is Docker, and why use it?

### The problem
Our app needs specific things to run:
- Node.js version 24
- all the npm packages
- a MongoDB database
- the right settings (environment variables)

On your Mac it works because you installed all of that. On a friend's laptop or a server, something is always different: a different Node version, no MongoDB, a missing setting. That's where "but it works on my machine!" comes from.

### The idea
Docker packs the app **plus everything it needs** into one box. That box runs the same way everywhere: your Mac, a Windows laptop, or a server in Mumbai.

Think of a **tiffin box**. The cook (you) packs the full meal once. Whoever opens it, anywhere, gets the same meal. They don't need your kitchen.

### Why it's worth learning
- **Same everywhere:** no more "works on my machine".
- **One command to start everything:** the app and the database together.
- **Clean:** nothing gets installed on your Mac except Docker itself. Delete the box and it's gone.
- **It's how real apps are deployed:** AWS, Google Cloud, Railway, Render and others all run containers.

---

## Lesson 2 — The 6 words you need

| Word | Plain meaning | Tiffin comparison |
| --- | --- | --- |
| **Dockerfile** | A recipe: step-by-step instructions to build the box | The recipe card |
| **Image** | The packed box, built from the recipe. Read-only. | A packed, sealed tiffin |
| **Container** | An image that is **running** | The tiffin opened and being eaten |
| **Volume** | Storage that survives when a container is deleted | A fridge: food stays when the tiffin is washed |
| **Port** | A numbered door into a container | The door number of the kitchen |
| **Compose** | A file that starts several containers together | A full thali: app plate + database bowl |

One image can make many containers, just like one recipe can make many tiffins.

---

## Lesson 3 — Install Docker and run Wearistry

### Step 1: Install Docker Desktop (one time)
1. Go to **docker.com → Products → Docker Desktop** and download it for Mac. Pick **Apple chip** or **Intel chip**, matching your Mac (Apple menu → About This Mac).
2. Open the downloaded file and drag Docker into Applications.
3. Open **Docker** from Applications. Wait until the whale icon in the top menu bar stops moving.

**Check it worked:** open Terminal and run:

```bash
docker --version
```

```bash
docker compose version
```

Both should print a version number. If you get "command not found", Docker Desktop isn't running yet.

### Step 2: Go to the project folder

```bash
cd ~/Desktop/app1/wearistry
```

Every Docker command below is run from this folder (the repo root), because Docker looks for `compose.yaml` here. The app's `Dockerfile` lives in `frontend/`.

### Step 3: Build and start everything

```bash
docker compose up --build
```

What happens (the first time takes a few minutes):
1. Docker reads `compose.yaml` and sees four services: **mongo** (the database), **migrate** (sets up the database), **api** (the backend) and **web** (the website).
2. It downloads the official MongoDB image and builds our two images from `backend/Dockerfile` and `frontend/Dockerfile`.
3. It starts them **in order:** mongo (wait until healthy) → migrate (runs once, then exits) → api (wait until healthy) → web.

When the `web` logs say `Ready`, open **http://localhost:3000**.

The database starts empty. To fill it with sample listings and threads (only needed once), run this in a second Terminal while everything is up:

```bash
docker compose run --rm api node scripts/seed.js
```

**Try it:** log in with any Indian mobile number. Local mode shows the 6-digit code on screen. Then list a piece with a photo, refresh, and it's still there: it's saved in MongoDB, and the photo is in a Docker volume.

### Step 4: Stop it
Press **Ctrl + C** in that Terminal window. The containers stop, and your data stays in the volumes.

---

## Lesson 4 — Our files explained line by line

### `frontend/Dockerfile`: the recipe

We build in **3 stages**. Each stage starts from a fresh base, and the final image keeps only what's needed to run. That makes the final image much smaller, and it has no build tools inside.

```dockerfile
FROM node:24-bookworm-slim AS deps
```
**FROM** picks a starting image: Node.js 24 on a slim Debian Linux. `AS deps` names this stage so later stages can copy from it.

```dockerfile
WORKDIR /app
```
**WORKDIR** is like `cd /app` inside the box. Later commands run there.

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
```
Copy **only** the package files first, then install the packages. **Why only these two files?** Docker caches each step. If you change your code but not your packages, Docker reuses this slow step instead of running `npm ci` again. This one trick saves minutes on every build.

`npm ci` is like `npm install`, but it installs exactly what's in `package-lock.json`, which is better for repeatable builds.

```dockerfile
FROM node:24-bookworm-slim AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
```
Stage 2 takes the installed packages from stage 1 (`--from=deps`), copies in all our code (`COPY . .`), and compiles the app.

```dockerfile
FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
```
Stage 3 is the final image. **ENV** sets environment variables. `HOSTNAME=0.0.0.0` means "accept connections from outside the container". Without it, the app would only listen to itself, and your browser couldn't reach it.

```dockerfile
RUN groupadd --system app && useradd --system --gid app app
...
USER app
```
Create a normal user and run as that user, not as **root** (the all-powerful admin). If someone ever broke into the app, they'd have far fewer powers. This is a good security habit.

```dockerfile
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
```
Copy only the compiled app from stage 2. Next.js's `output: "standalone"` setting (in `next.config.ts`) makes this small self-contained folder.

```dockerfile
EXPOSE 3000
CMD ["node", "server.js"]
```
**EXPOSE** documents that the app uses port 3000. **CMD** is the command that runs when the container starts.

### `frontend/.dockerignore`: what NOT to pack
Like `.gitignore`, but for Docker. We skip:
- `node_modules` and `.next`: rebuilt inside the image anyway, and copying them would be slow.
- `.env*`: **secrets must never go inside an image.** Anyone with the image could read them.
- `.data`: your local test photos.

### `compose.yaml`: the thali (several containers together)

The project now runs three of our own pieces together (database, API, website), so `compose.yaml` grew. It's explained line by line in **Lesson 7** below. Two ideas from it matter right away:

- **Ports map your Mac's door to the container's door.** `"3000:3000"` means opening `localhost:3000` on your Mac goes into the web container. If port 3000 is busy, change it to `"3001:3000"` and open `localhost:3001`.
- **Containers find each other by service name.** The API connects to the database at `mongo:27017`, and the website talks to the API at `api:4000`. No IP addresses are needed.

---

## Lesson 5 — Everyday commands: what and when

| When you want to… | Run this | Notes |
| --- | --- | --- |
| Start everything (first time, or after code changes) | `docker compose up --build` | `--build` rebuilds the app image with your latest code |
| Start everything in the background | `docker compose up --build -d` | `-d` = detached, so your Terminal stays free |
| See what's running | `docker compose ps` | Shows each container and whether it's healthy |
| Watch the logs | `docker compose logs -f api` (or `web`, `mongo`) | `-f` = follow live. Ctrl + C stops watching, not the app |
| See whether migrations ran | `docker compose logs migrate` | It should end with "Applied N migration(s)" or "Up to date" |
| Fill an empty database with sample data | `docker compose run --rm api node scripts/seed.js` | `run --rm` starts a one-off container from the api image and deletes it afterwards |
| Run migrations again by hand | `docker compose run --rm migrate` | Safe to repeat: applied migrations are skipped |
| Open the API docs | http://localhost:4000/api/docs | The API's port is published only to your own computer |
| Stop everything (keep data) | `docker compose down` | Containers are removed, volumes stay |
| Restart one service | `docker compose restart api` | Quick restart without rebuilding |
| Rebuild just one image | `docker compose up --build api` | Useful after backend-only changes |
| Open a shell inside a container | `docker compose exec api sh` | Look around inside. Type `exit` to leave |
| Open the MongoDB shell | `docker compose exec mongo mongosh wearistry` | Then try `db.products.countDocuments()` |
| ⚠️ Stop and **delete all data** | `docker compose down -v` | `-v` deletes the volumes: database and photos. Fresh start |
| See all images on your Mac | `docker images` | |
| Free disk space from old images | `docker system prune` | Removes stopped containers and unused images. It asks first |

**The everyday loop while coding:**
1. Change some code.
2. Run `docker compose up --build`.
3. Test at localhost:3000.
4. Press Ctrl + C, or run `docker compose down` when you're done.

For fast day-to-day coding, `npm run dev` (in `backend/` and `frontend/`) is still quicker, because it reloads instantly. Use Docker to check that the **built images** work together, and to run the whole stack without installing anything but Docker.

---

## Lesson 6 — When things go wrong

| You see | It means | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | Open Docker from Applications and wait for the whale icon |
| `port is already allocated` / `address already in use` | Something else (maybe `npm run dev`) is using port 3000 | Stop the other thing, or change `"3000:3000"` to `"3001:3000"` |
| Build fails at `npm run build` with font errors | The build couldn't reach Google Fonts | Check your internet connection and build again |
| `web` never starts; `api` shows `unhealthy` | The API can't reach MongoDB, or it crashed at startup | `docker compose logs api`. A list of "Invalid environment configuration" problems means a setting in `compose.yaml` is wrong |
| `migrate` exited with an error, so `api` won't start | A migration failed | `docker compose logs migrate`, fix the cause, then `docker compose up` again (migrations that already ran are skipped) |
| The website loads but pages show an error | The web container can't reach the API | Check `docker compose ps` (api should be `healthy`). `API_INTERNAL_URL` must be `http://api:4000`, both as a build arg and as an environment variable |
| Logged in, but the login is "forgotten" immediately | The cookie was rejected | Use `http://localhost:3000` (not `127.0.0.1`), and keep `NODE_ENV: development` for the local stack: production cookies require HTTPS |
| `Unable to determine transport target for "pino-pretty"` in the api logs | Pretty logging is on, but the image doesn't include it | Keep `LOG_PRETTY: "false"` in `compose.yaml` |
| Changes don't show up | You started without rebuilding | Run `docker compose up --build` |
| Want a totally fresh start | Old data is confusing you | `docker compose down -v`, then `docker compose up --build` (deletes all data) |

**Golden rule:** when stuck, read the logs first with `docker compose logs -f`.

---

## Practice (try these yourself)

1. Start the app in the background with `-d`, then check it with `docker compose ps`.
2. Log in, list a piece, then run `docker compose down` and `docker compose up -d`. Is your listing still there? Why? (Hint: volumes.)
3. Open the MongoDB shell and count the threads: `db.threads.countDocuments()`.
4. Change the home page heading in `src/app/page.tsx`, rebuild, and see it change.
5. Run `docker images` and compare the sizes of the `wearistry-api` and `wearistry-web` images. Why is the API image so much smaller than `backend/node_modules`? (Hint: `npm ci --omit=dev`.)
6. Stop just the api (`docker compose stop api`) and reload the website. What do you see? Start it again with `docker compose start api`.
7. Run the seed twice. Why does the second run say "skipped"?

---

## Lesson 7 — A multi-service stack: database, API and website

The app is now three pieces: **MongoDB**, the **API** (`backend/`) and the **website** (`frontend/`). Compose starts them in the right order, connects them on a private network, and keeps their data in volumes.

```
your browser ──► web (port 3000) ──/api/v1/*──► api (port 4000) ──► mongo (port 27017)
                 Next.js                        Express              database
```

### `backend/Dockerfile`: the API's recipe

```dockerfile
FROM node:24-bookworm-slim AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
```
**`--omit=dev`** installs only what the server needs to run: no test tools, linters or log prettifier. When this was rehearsed, the packages shrank from **332 MB to 80 MB**. Smaller images build, upload and start faster, and contain less code that could have security holes.

```dockerfile
FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production PORT=4000
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app src ./src
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app scripts ./scripts
USER app
```
- **No build stage:** the API is plain JavaScript, so it runs as written. We copy only the folders the server needs: no tests or docs.
- **`--chown=app:app`:** the copied files belong to the non-root `app` user that runs the server.

```dockerfile
HEALTHCHECK --interval=10s ... CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live')..."
```
A **health check** is a small command Docker runs every 10 seconds inside the container. If it fails 3 times, Docker marks the container `unhealthy`. We use `node` with `fetch` because the slim image has no `curl`.

### `frontend/Dockerfile`: build arguments vs environment variables

```dockerfile
ARG API_INTERNAL_URL=http://localhost:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm run build
```
- **`ARG`** is a value available only **while building**.
- **`ENV`** is a value available while building **and** when running.
- **Why it matters here:** Next.js writes the `/api/v1` proxy target into the build output. So `API_INTERNAL_URL` must be known at build time, and changing it means rebuilding. Compose passes it under `build.args`.

The same goes for `NEXT_PUBLIC_GOOGLE_LOGIN`: anything starting `NEXT_PUBLIC_` is copied into the browser code during the build.

### `compose.yaml`, line by line

```yaml
  migrate:
    build: ./backend
    command: ["node", "scripts/migrate.js", "up"]
    restart: "no"
```
- **A one-job service:** it uses the API image, but replaces the start command (`command`) with "run the migrations". It runs once and exits.
- **`restart: "no"`:** Docker leaves it stopped once it's finished, instead of restarting it.

```yaml
    environment: &api-env
      NODE_ENV: development
      ...
  api:
    environment: *api-env
```
- **`&api-env` names a block, and `*api-env` reuses it.** This is a YAML **anchor**. `migrate` and `api` need identical settings, so they're written once.
- **Why `NODE_ENV: development`:** this is a local stack. It allows on-screen login codes (`OTP_DEV_CODES`), and lets cookies work over plain `http://localhost`. In production, cookies require HTTPS and the API refuses dev codes.

```yaml
      LOG_PRETTY: "false"
```
The production image doesn't include the log prettifier (`npm ci --omit=dev`). Without this line, the API crashes at startup with `Unable to determine transport target for "pino-pretty"`. That was confirmed in the rehearsal. With it, logs come out as JSON.

```yaml
      MONGODB_URI: mongodb://mongo:27017/wearistry
      TRUST_PROXY_HOPS: "1"
```
- **`MONGODB_URI`:** `mongo` is the database service's name.
- **`TRUST_PROXY_HOPS: "1"`:** requests reach the API through one proxy (the web app), so the API trusts one hop when it works out the visitor's IP for rate limiting.

```yaml
      AUTH_SECRET: ${AUTH_SECRET:-local-docker-secret-change-me-32-chars-min}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
```
- **`${NAME:-default}`** reads the value from your shell, or from a `.env` file next to `compose.yaml`, and falls back to the default.
- **Real secrets stay out of the file:** put them in a root `.env`, which git ignores.

```yaml
    depends_on:
      migrate:
        condition: service_completed_successfully
```
**Start the API only after migrations finish successfully.** If a migration fails, the API never starts with a half-updated database.

```yaml
  api:
    healthcheck:
      test: [..., "fetch('http://127.0.0.1:4000/api/v1/health/ready')..."]
  web:
    depends_on:
      api:
        condition: service_healthy
```
- **Readiness, not just "alive":** the API's compose health check uses `/health/ready`, which is only OK while MongoDB is connected.
- **The web container waits** until the API is ready, so its first page doesn't fail.

```yaml
    ports:
      - "127.0.0.1:4000:4000"
```
**Publishes the API only to your own computer,** so you can open the API docs at `http://localhost:4000/api/docs`. The web app doesn't need this: containers talk on their own private network.

```yaml
  web:
    build:
      context: ./frontend
      args:
        API_INTERNAL_URL: http://api:4000
    environment:
      API_INTERNAL_URL: http://api:4000
```
- **`args`:** build arguments (see above).
- **`environment`:** the same address for server-rendered pages at runtime.
- **Two places, one value:** the proxy needs it while building, and the page code needs it while running.

```yaml
volumes:
  mongo-data:
  uploads:
```
**Named volumes keep the database and uploaded photos** when containers are rebuilt or removed. Only `docker compose down -v` deletes them.

### When to run what

| Situation | Command |
| --- | --- |
| First time, or after pulling new code | `docker compose up --build` |
| Empty database, want sample data | `docker compose run --rm api node scripts/seed.js` |
| Changed only backend code | `docker compose up --build api` |
| Changed only frontend code | `docker compose up --build web` |
| Changed `API_INTERNAL_URL` or `NEXT_PUBLIC_*` | Rebuild web: `docker compose build web`, then `docker compose up` |
| Done for the day | `docker compose down` (data kept) |

---

## Lesson log

New lessons get added here, newest at the bottom.

| Date | Lesson | What was added to the project |
| --- | --- | --- |
| 2026-11-02 | Lessons 1–6: what Docker is, the 6 words, install, our files line by line, everyday commands, troubleshooting | `Dockerfile`, `.dockerignore`, `compose.yaml` (app + MongoDB), `DEV_MODE` local mode |
| 2026-11-02 | Build context | The app moved to `frontend/`, so compose now builds from `./frontend` |
| 2026-11-02 | Lesson 7: a multi-service stack; build args vs env; one-job services; health checks; start-up order; YAML anchors | `backend/Dockerfile`, `backend/.dockerignore`, compose with `mongo`, `migrate`, `api` and `web`. Removed the old `DEV_MODE` (the web app no longer stores data) |

**Coming next:** deploying the containers to a real server (AWS in the Mumbai region), passing real secrets safely, HTTPS, and adding Redis for shared rate limits.
