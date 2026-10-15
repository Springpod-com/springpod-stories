# syntax=docker/dockerfile:1.7
# Images for Work Experience Stories (docs/deploy.md). One file, three targets:
#   app      the Next.js server (public flow, admin, API)       docker build --target app -t wes-app .
#   worker   background jobs: media checks, conversion,         docker build --target worker -t wes-worker .
#            transcripts, pre-screen, quote cards, retention
#   migrate  applies database migrations, run once per release  docker build --target migrate -t wes-migrate .
# Nothing provider-specific: configuration comes from the environment at run time.

ARG NODE_IMAGE=node:22.23.3-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# OpenSSL for Prisma's migration engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Every dependency, for building and for migrations. Installing also generates the Prisma client.
FROM base AS deps
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Public settings are baked into the browser code at build time (docs/deploy.md).
ARG NEXT_PUBLIC_GA4_ID=
ENV NEXT_OUTPUT=standalone NEXT_PUBLIC_GA4_ID=${NEXT_PUBLIC_GA4_ID}
RUN pnpm build

# Production dependencies only, for the worker. The Prisma client comes from the build stage.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]

FROM ${NODE_IMAGE} AS worker
# ffmpeg for media checks and conversion; Chromium and fonts for the quote card images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium fonts-liberation fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node worker ./worker
COPY --from=build --chown=node:node /app/src ./src
USER node
CMD ["node_modules/.bin/tsx", "--conditions=react-server", "worker/index.ts"]

FROM deps AS migrate
ENV NODE_ENV=production
# Also carries the scripts: `pnpm staff:add` and, for local stacks, the bucket setup.
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
