// Prisma 7 CLI configuration (official upgrade guide,
// prisma.io/docs/guides/upgrade-prisma-orm/v7 → "Prisma config").
// Replaces `url = env("DATABASE_URL")` in schema.prisma and
// `package.json#prisma.seed`. Prisma 7 no longer loads `.env` itself, so the
// file is loaded here (quietly; on ECS/CI the variables are already set and
// dotenv never overrides a variable that is set).
//
// `process.env` instead of `env()`: `prisma generate` (Dockerfile, CI jobs
// without a database) must work when DATABASE_URL is not set — the config
// reference, "Handling optional environment variables".
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // No `migrations.path`: the migrations stay next to the schema in use, as
  // in Prisma 6, so `--schema <staged copy>` (scripts/migrate-from-previous.mjs)
  // still reads the staged migrations.
  migrations: {
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
