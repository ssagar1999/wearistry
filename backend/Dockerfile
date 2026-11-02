# Wearistry API image. Explained step by step in ../teachdockerfile.md (Lesson 7).
# Plain JavaScript, so there's no compile step: one stage installs production packages, the other runs.

# 1. deps: install only the packages the server needs at runtime (no linters, test tools or pino-pretty).
#    Cached until package.json or package-lock.json change.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. run: the code plus those packages, running as a normal (non-root) user.
FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000
RUN groupadd --system app && useradd --system --gid app app \
    && mkdir -p .data/uploads && chown -R app:app .data
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app scripts ./scripts
USER app
EXPOSE 4000
# Docker marks the container unhealthy if the process stops answering ("liveness").
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/v1/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "src/server.js"]
