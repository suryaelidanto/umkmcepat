# syntax=docker/dockerfile:1

# Fully-qualified registry prefix (docker.io/) so the base image resolves under
# podman as well as Docker (podman with no registries.conf won't resolve bare
# short names like `oven/bun`).
FROM docker.io/oven/bun:1.3.9-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM docker.io/oven/bun:1.3.9-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

FROM docker.io/oven/bun:1.3.9-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PROJECT_THUMBNAIL_BROWSER_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache chromium nodejs \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# TanStack Start build output is a Nitro server bundle under .output/ (run via
# `bun .output/server/index.mjs`). The old Next.js Dockerfile copied .next +
# next.config.ts, which no longer exist after the TanStack Start migration.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/capture-project-thumbnail.cjs ./scripts/capture-project-thumbnail.cjs

RUN mkdir -p .data/uploads .data/project-artifacts .data/project-thumbnails \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

CMD ["bun", ".output/server/index.mjs"]
