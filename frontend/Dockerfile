# Wearistry web app image. Built in 3 stages so the final image only has what's needed to run.
# Explained step by step in ../teachdockerfile.md (Lessons 4 and 7).

# 1. deps: install npm packages (cached until package.json or package-lock.json change)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. build: compile the Next.js app.
#    These values are baked into the build: the /api/v1 proxy target (next.config.ts) and
#    NEXT_PUBLIC_* variables (inlined into browser code). Changing them means rebuilding the image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG API_INTERNAL_URL=http://localhost:4000
ARG NEXT_PUBLIC_GOOGLE_LOGIN=false
ENV NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_GOOGLE_LOGIN=$NEXT_PUBLIC_GOOGLE_LOGIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. run: a slim image with just the compiled server, running as a normal (non-root) user.
FROM node:24-bookworm-slim AS run
WORKDIR /app
ARG API_INTERNAL_URL=http://localhost:4000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=$API_INTERNAL_URL
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
