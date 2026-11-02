# Learn Docker with Wearistry

This file teaches Docker step by step, using our own app. Each lesson says **why** you do something, **what command** to run, and **when** to run it. New lessons get added at the bottom as the project grows (see the [Lesson log](#lesson-log)).

> Status: the Docker files are written, and the app's production build was tested running the same way the container runs it. The `docker` commands themselves haven't been run yet, because Docker wasn't installed on this Mac. Lesson 3 is your first real run, and if anything breaks, that's a lesson too.

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

Every Docker command below is run from this folder, because Docker looks for `Dockerfile` and `compose.yaml` here.

### Step 3: Build and start everything

```bash
docker compose up --build
```

What happens (the first time takes a few minutes):
1. Docker reads `compose.yaml` and sees two services: **web** (our app) and **mongo** (the database).
2. It downloads the official MongoDB image.
3. It follows our `Dockerfile` to build the app image.
4. It starts MongoDB, waits until it's healthy, then starts the app.

When you see `Ready` in the logs, open **http://localhost:3000**.

**Try it:** log in with any Indian mobile number. Local mode shows the 6-digit code on screen. Then list a piece with a photo, refresh, and it's still there, because it's saved in MongoDB this time, not in memory.

### Step 4: Stop it
Press **Ctrl + C** in that Terminal window. The containers stop, and your data stays in the volumes.

---

## Lesson 4 — Our files explained line by line

### `Dockerfile`: the recipe

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

### `.dockerignore`: what NOT to pack
Like `.gitignore`, but for Docker. We skip:
- `node_modules` and `.next`: rebuilt inside the image anyway, and copying them would be slow.
- `.env*`: **secrets must never go inside an image.** Anyone with the image could read them.
- `.data`: your local test photos.

### `compose.yaml`: the thali (several containers together)

```yaml
services:
  web:
    build: .
```
The **web** service is built from the `Dockerfile` in this folder (`.`).

```yaml
    ports:
      - "3000:3000"
```
**Your Mac's port : the container's port.** Opening `localhost:3000` on your Mac goes through door 3000 into the container. If port 3000 is already busy on your Mac, change it to `"3001:3000"` and open `localhost:3001`.

```yaml
    environment:
      MONGODB_URI: mongodb://mongo:27017/wearistry
```
Inside compose, containers find each other **by service name**. Our database service is called `mongo`, so the app connects to the host `mongo`. No IP addresses needed.

```yaml
      AUTH_SECRET: ${AUTH_SECRET:-local-docker-secret-change-me}
      DEV_MODE: "true"
```
`${AUTH_SECRET:-...}` means "use AUTH_SECRET from your environment, or this default". `DEV_MODE: "true"` turns on local mode: login codes show on screen and photos are saved in a volume. ⚠️ **Never set DEV_MODE on the live site**, because then anyone could log in as any phone number.

```yaml
    volumes:
      - uploads:/app/.data/uploads
```
Uploaded photos are saved in a **named volume** called `uploads`, so they survive when the container is deleted or rebuilt.

```yaml
    depends_on:
      mongo:
        condition: service_healthy
```
Don't start the app until MongoDB says it's healthy.

```yaml
  mongo:
    image: mongo:8
```
The **mongo** service uses the official MongoDB 8 image from Docker Hub. There's no Dockerfile for it, because someone already packed it for us.

```yaml
    ports:
      - "127.0.0.1:27017:27017"
```
This lets you peek at the database from your Mac, for example with MongoDB Compass at `mongodb://localhost:27017`. `127.0.0.1` means only your own computer can connect, not others on your Wi-Fi.

```yaml
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
```
Every 5 seconds Docker asks MongoDB "are you alive?". This is what `service_healthy` waits for.

---

## Lesson 5 — Everyday commands: what and when

| When you want to… | Run this | Notes |
| --- | --- | --- |
| Start everything (first time, or after code changes) | `docker compose up --build` | `--build` rebuilds the app image with your latest code |
| Start everything in the background | `docker compose up --build -d` | `-d` = detached, so your Terminal stays free |
| See what's running | `docker compose ps` | Shows each container and whether it's healthy |
| Watch the app's logs | `docker compose logs -f web` | `-f` = follow live. Ctrl + C stops watching, not the app |
| Stop everything (keep data) | `docker compose down` | Containers are removed, volumes stay |
| Restart only the app | `docker compose restart web` | Quick restart without rebuilding |
| Open a shell inside the app container | `docker compose exec web sh` | Look around inside. Type `exit` to leave |
| Open the MongoDB shell | `docker compose exec mongo mongosh wearistry` | Then try `db.products.countDocuments()` |
| ⚠️ Stop and **delete all data** | `docker compose down -v` | `-v` deletes the volumes: database and photos. Fresh start |
| See all images on your Mac | `docker images` | |
| Free disk space from old images | `docker system prune` | Removes stopped containers and unused images. It asks first |

**The everyday loop while coding:**
1. Change some code.
2. Run `docker compose up --build`.
3. Test at localhost:3000.
4. Press Ctrl + C, or run `docker compose down` when you're done.

For fast day-to-day coding, `npm run dev` is still quicker, because it reloads instantly. Use Docker to check that the **real production version** works, and to run MongoDB locally.

---

## Lesson 6 — When things go wrong

| You see | It means | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | Open Docker from Applications and wait for the whale icon |
| `port is already allocated` / `address already in use` | Something else (maybe `npm run dev`) is using port 3000 | Stop the other thing, or change `"3000:3000"` to `"3001:3000"` |
| Build fails at `npm run build` with font errors | The build couldn't reach Google Fonts | Check your internet connection and build again |
| App starts but every page errors with Mongo messages | MongoDB isn't ready or is unreachable | Run `docker compose ps` (mongo should be `healthy`) and `docker compose logs mongo` |
| Changes don't show up | You started without rebuilding | Run `docker compose up --build` |
| Want a totally fresh start | Old data is confusing you | `docker compose down -v`, then `docker compose up --build` (deletes all data) |

**Golden rule:** when stuck, read the logs first with `docker compose logs -f`.

---

## Practice (try these yourself)

1. Start the app in the background with `-d`, then check it with `docker compose ps`.
2. Log in, list a piece, then run `docker compose down` and `docker compose up -d`. Is your listing still there? Why? (Hint: volumes.)
3. Open the MongoDB shell and count the threads: `db.threads.countDocuments()`.
4. Change the home page heading in `src/app/page.tsx`, rebuild, and see it change.
5. Run `docker images` and find the size of the `wearistry-web` image. Why is it smaller than the `node_modules` folder?

---

## Lesson log

New lessons get added here, newest at the bottom.

| Date | Lesson | What was added to the project |
| --- | --- | --- |
| 2026-11-02 | Lessons 1–6: what Docker is, the 6 words, install, our files line by line, everyday commands, troubleshooting | `Dockerfile`, `.dockerignore`, `compose.yaml` (app + MongoDB), `DEV_MODE` local mode |

**Coming next:** deploying the container to a real server (AWS in the Mumbai region), keeping secrets out of the image, and adding Redis for the login codes.
