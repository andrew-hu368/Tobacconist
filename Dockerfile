# Do not use alpine as it has a different implementation of libc which breaks libsql
FROM --platform=linux/amd64 node:20.12.2-bookworm-slim@sha256:72f2f046a5f8468db28730b990b37de63ce93fd1a72a40f531d6aa82afdf0d46 AS installer

# Leveraging BuildKit cache mounts
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install openssl for prisma, corepack and pnpm
RUN apt-get update -y && apt-get install -y openssl dumb-init && corepack enable && corepack prepare pnpm@8.5.1 --activate

WORKDIR /home/node

COPY . .

# Install deps and build the app
FROM installer AS builder

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile && pnpm run build

FROM installer AS deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod && pnpm prisma generate

FROM installer

RUN apt-get update && apt-get install -y dumb-init

WORKDIR /home/node

COPY --from=builder --chown=node:node /home/node/dist ./dist
COPY --from=builder --chown=node:node /home/node/public ./public
COPY --from=deps --chown=node:node /home/node/node_modules ./node_modules

USER node

# Use dumb-init to handle signals properly
# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
CMD ["dumb-init", "node", "dist/server.js"]
