FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Install dependencies (workspace-aware)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build shared, then api
FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm --filter @haps/shared build
RUN pnpm --filter @haps/api build

# Production image
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3000
CMD ["node", "packages/api/dist/server.js"]
