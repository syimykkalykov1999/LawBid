import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { baseUrls, e2eRedisUrl, withDatabase } from './e2e-env';

const MIGRATIONS_DIR = join(__dirname, '../../prisma/migrations');

// The e2e database is named after a hash of every migration, so it is
// reused (and only emptied) while migrations are unchanged, and rebuilt
// when they change. Migrating a fresh CockroachDB takes minutes — every
// DDL statement is a schema-change job — while TRUNCATE takes seconds.
function migrationsHash(): { hash: string; count: number } {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const h = createHash('sha256');
  for (const dir of dirs) {
    h.update(dir);
    h.update(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql')));
  }
  return { hash: h.digest('hex').slice(0, 12), count: dirs.length };
}

// Creates or reuses the per-schema e2e database, empties it, clears the
// e2e Redis DB. Workers read E2E_DATABASE_URL (see e2e-setup-env.ts). The
// dev database is never touched: only `<base>_e2e_<suffix>` databases,
// which this setup itself creates, are ever removed.
export default async function globalSetup(): Promise<void> {
  const { databaseUrl } = baseUrls();
  const baseName = new URL(databaseUrl).pathname.slice(1);
  const { hash, count } = migrationsHash();
  const dbName = `${baseName}_e2e_${hash}`;
  const url = withDatabase(databaseUrl, dbName);

  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  const existing = await admin.$queryRaw<{ database_name: string }[]>`
    SELECT database_name FROM [SHOW DATABASES]
    WHERE database_name LIKE ${`${baseName}_e2e_%`}`;
  for (const { database_name } of existing) {
    if (database_name !== dbName) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${database_name}" CASCADE`,
      );
    }
  }

  let ready = false;
  if (existing.some((d) => d.database_name === dbName)) {
    const db = new PrismaClient({ datasourceUrl: url });
    const [{ applied }] = await db.$queryRaw<{ applied: bigint }[]>`
      SELECT count(*) AS applied FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    ready = Number(applied) === count;
    if (ready) {
      const tables = await db.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name <> '_prisma_migrations'`;
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(', ')} CASCADE`,
      );
    }
    await db.$disconnect();
    if (!ready) {
      // Half-migrated leftover of an interrupted run: rebuild it.
      await admin.$executeRawUnsafe(`DROP DATABASE "${dbName}" CASCADE`);
    }
  }
  if (!ready) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'ignore',
    });
  }
  await admin.$disconnect();

  process.env.E2E_DATABASE_URL = url;
  const redis = new Redis(e2eRedisUrl());
  await redis.flushdb();
  await redis.quit();
}
