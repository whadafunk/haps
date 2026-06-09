FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
RUN pnpm --filter @haps/shared build
RUN pnpm --filter @haps/web build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/web/build ./packages/web/build
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3000
CMD ["node", "packages/web/build"]
