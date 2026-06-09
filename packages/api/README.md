# packages/api

Fastify REST API. Node.js 22 + TypeScript.

## Scaffold this package with:

```bash
cd packages/api
pnpm init
pnpm add fastify @fastify/cookie @fastify/rate-limit @fastify/multipart
pnpm add drizzle-orm pg
pnpm add argon2 jsonwebtoken nodemailer zod nanoid node-cron
pnpm add -D typescript @types/node @types/pg @types/jsonwebtoken @types/nodemailer
pnpm add -D drizzle-kit vitest
```

## Scripts to add to package.json:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

See @docs/architecture.md for the full directory structure.
See @.claude/rules/api.md for coding conventions.
See @docs/data-model.md for the DB schema to implement in src/db/schema.ts.
