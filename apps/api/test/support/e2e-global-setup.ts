import { DEFAULT_BAR_FORMATS } from '../../src/modules/verification/bar-number-format';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import {
  baseUrls,
  e2eIsolationTag,
  e2eRedisUrl,
  withDatabase,
} from './e2e-env';

const MIGRATIONS_DIR = join(__dirname, '../../prisma/migrations');

// The e2e database is named after a hash of every migration, so it is
// reused (and only emptied) while migrations are unchanged, and rebuilt
// when they change. Migrating a fresh PostgreSQL takes minutes — every
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
  const tag = e2eIsolationTag();
  const prefix = tag ? `${baseName}_e2e_${tag}_` : `${baseName}_e2e_`;
  const dbName = `${prefix}${hash}`;
  const url = withDatabase(databaseUrl, dbName);

  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  const existing = await admin.$queryRaw<{ database_name: string }[]>`
    SELECT datname AS database_name FROM pg_database
    WHERE datname LIKE ${`${prefix.replace(/[_%]/g, '\\$&')}%`}`;
  for (const { database_name } of existing) {
    // Only this run's own family (same isolation tag, older hash) is
    // dropped; an untagged run never touches tagged databases.
    const rest = database_name.slice(prefix.length);
    if (database_name !== dbName && /^[0-9a-f]{12}$/.test(rest)) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${database_name}" WITH (FORCE)`,
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
          AND table_name NOT IN ('_prisma_migrations', 'countries')`;
      // `countries` is reference data the baseline migration inserts
      // (regions point at it); the suites never change it, so it stays.
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(', ')} CASCADE`,
      );
    }
    await db.$disconnect();
    if (!ready) {
      // Half-migrated leftover of an interrupted run: rebuild it.
      await admin.$executeRawUnsafe(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    }
  }
  if (!ready) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'ignore',
    });
    // Migration 20261007090000_email_flows_off seeds «Вход и письма по
    // почте» off for prod; the suites run with e-mail flows on (a missing
    // row counts as on — the same state a reused, truncated DB starts in).
    const db = new PrismaClient({ datasourceUrl: url });
    await db.featureFlag.deleteMany({ where: { key: 'email_login' } });
    await db.$disconnect();
  }
  // Owner 2026-10-14: production sends offers only after the licence is
  // confirmed (`trust.bids_require_cleared`); the suites place offers
  // without a registry, so they start with the gate open. The suites about
  // the gate itself switch it on explicitly.
  const seed = new PrismaClient({ datasourceUrl: url });
  await seed.appConfig.upsert({
    where: { key: 'trust.bids_require_cleared' },
    create: { key: 'trust.bids_require_cleared', value: false },
    update: { value: false },
  });
  // Bar numbers: the suites type arbitrary ones, so every listed state
  // accepts any 3+ letters / digits here; the format suite sets its own.
  const loose = Object.fromEntries(
    Object.keys(DEFAULT_BAR_FORMATS).map((state) => [
      state,
      { pattern: '^[A-Z0-9]{3,32}$', example: 'ABC123' },
    ]),
  );
  await seed.appConfig.upsert({
    where: { key: 'verification.bar_formats' },
    create: { key: 'verification.bar_formats', value: JSON.stringify(loose) },
    update: { value: JSON.stringify(loose) },
  });
  // Owner 2026-10-16: production sends an SMS code only to a new number and
  // for a password reset; the suites sign the same numbers in by code again
  // and again, so they start with the old behaviour (the rollback switch).
  // The suite about the new rules turns it off itself.
  await seed.appConfig.upsert({
    where: { key: 'sms.login_code_enabled' },
    create: { key: 'sms.login_code_enabled', value: true },
    update: { value: true },
  });
  // Owner 2026-10-16: production keeps a new license pending until a registry
  // or a person confirms it, with the bar card where nobody checks the
  // number; the suites type arbitrary numbers and expect the old sworn
  // self-approval. The suites about the new rules switch them on.
  for (const [key, value] of [
    ['verification.self_attestation_auto_approve', true],
    ['verification.bar_document_for_manual_states', false],
  ] as const) {
    await seed.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  // The economy guard (flag missing = on) turns the sending of confirmation
  // SMS (phone changes, contact checks) into a 503 as soon as the 5-minute
  // `economy.guard` job of ANY suite's worker finds the month's counters
  // above the allowance of an empty test database — a time-dependent
  // failure in whichever suite ran next. The suites start with it off;
  // owner-economy.e2e-spec.ts turns it on for itself and back off after.
  await seed.featureFlag.upsert({
    where: { key: 'economy_guard' },
    create: {
      key: 'economy_guard',
      enabled: false,
      rollout_percent: 100,
      description: 'e2e: off unless a suite is about the guard',
    },
    update: { enabled: false },
  });
  await seed.$disconnect();
  await admin.$disconnect();

  process.env.E2E_DATABASE_URL = url;
  const redis = new Redis(e2eRedisUrl());
  await redis.flushdb();
  await redis.quit();
}
