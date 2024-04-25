# Do not use alpine as it has a different implementation of libc which breaks libsql
FROM --platform=linux/amd64 node:20.12.2-bookworm-slim@sha256:72f2f046a5f8468db28730b990b37de63ce93fd1a72a40f531d6aa82afdf0d46 AS installer

# Leveraging BuildKit cache mounts
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install openssl for prisma, corepack and pnpm
RUN apt-get update -y && apt-get install -y openssl dumb-init && corepack enable && corepack prepare pnpm@8.5.1 --activate

WORKDIR /app

COPY . .

# Install deps and build the app
FROM installer AS builder

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile && pnpm run build

FROM installer AS deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod && pnpm prisma generate

FROM installer

RUN apt-get update && apt-get install -y dumb-init

WORKDIR /app

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

USER node

ENV TURSO_AUTH_TOKEN="your-auth-token"
ENV TURSO_DATABASE_URL="http://127.0.0.1:8080/prisma/dev"
ENV NODE_ENV="production"
ENV PORT=3000
ENV REDIS_URL="redis://localhost:6379"
ENV FTP_HOST="ftp.example.com"
ENV FTP_USER="user"
ENV FTP_PASS="pass"
ENV JWT_SECRET="s3cr3t!"
ENV BULL_BOARD_USER="user"
ENV BULL_BOARD_PASS="pass"

# Use dumb-init to handle signals properly
# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
CMD ["dumb-init", "node", "dist/server.js"]
