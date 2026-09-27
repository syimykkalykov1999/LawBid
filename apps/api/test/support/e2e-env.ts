import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';

// Real-infra e2e suites (auth.e2e-spec.ts) assume a fresh database and an
// empty Redis: they expect brand-new phone identifiers and zero rate-limit
// counters. Running them against the developer's dev DB/Redis made every
// re-run fail (429s, isNewUser=false). They use a separate database
// (<db>_e2e_<migrations hash>, emptied before every run by globalSetup)
// and Redis logical DB 15 — the dev database is never touched.
export function baseUrls(): { databaseUrl: string; redisUrl: string } {
  loadDotenv({ path: join(__dirname, '../../.env'), quiet: true });
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
  };
}

export function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

// Parallel runs (e.g. several worktrees at once) set E2E_ISOLATION to a
// short [a-z0-9] tag and E2E_REDIS_DB to a free logical DB so they never
// share (or drop) each other's database and Redis state.
export function e2eIsolationTag(): string {
  const tag = process.env.E2E_ISOLATION ?? '';
  if (!/^[a-z0-9]{0,16}$/.test(tag)) {
    throw new Error('E2E_ISOLATION must match [a-z0-9]{0,16}');
  }
  return tag;
}

export function e2eRedisUrl(): string {
  const u = new URL(baseUrls().redisUrl);
  const db = process.env.E2E_REDIS_DB ?? '15';
  if (!/^(1[0-5]|[1-9])$/.test(db)) {
    throw new Error('E2E_REDIS_DB must be 1..15 (0 is the dev DB)');
  }
  u.pathname = `/${db}`;
  return u.toString();
}
