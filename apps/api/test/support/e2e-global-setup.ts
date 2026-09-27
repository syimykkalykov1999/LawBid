import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { baseUrls, e2eRedisUrl, withDatabase } from './e2e-env';

// Creates a fresh per-run database, applies migrations, clears the e2e
// Redis DB. Workers read E2E_DATABASE_URL (see e2e-setup-env.ts).
export default async function globalSetup(): Promise<void> {
  const { databaseUrl } = baseUrls();
  const baseName = new URL(databaseUrl).pathname.slice(1);
  const dbName = `${baseName}_e2e_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`);
  await admin.$disconnect();

  const url = withDatabase(databaseUrl, dbName);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  process.env.E2E_DATABASE_NAME = dbName;
  process.env.E2E_DATABASE_URL = url;

  const redis = new Redis(e2eRedisUrl());
  await redis.flushdb();
  await redis.quit();
}
