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

export function e2eRedisUrl(): string {
  const u = new URL(baseUrls().redisUrl);
  u.pathname = '/15';
  return u.toString();
}
