# Wearistry image. Built in 3 stages so the final image only has what's needed to run.
# Explained step by step in ../teachdockerfile.md.

# 1. deps: install npm packages (cached until package.json or package-lock.json change)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. build: compile the Next.js app
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. run: a slim image with just the compiled server
FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Run as a normal user, not root
RUN groupadd --system app && useradd --system --gid app app \
    && mkdir -p .data/uploads && chown -R app:app .data
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
