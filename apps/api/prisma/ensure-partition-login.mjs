#!/usr/bin/env node
// Automation audit 2026-11-08: gives the role lawbid_partition its login, so
// that partition.*_mode = auto can really convert a big table online without
// a manual step (before: scripts/deploy/prod-db-setup.sh by hand, which also
// rotates every other password).
//
// Runs in the migrate task after `prisma migrate deploy` (as the migrator,
// which created the role in 20261112100000 and may set its password).
// Terraform (`partition_role_enabled = true`) generates PARTITION_DB_PASSWORD
// into Secrets Manager and gives it to this task and to the worker; the worker
// builds its connection from DATABASE_URL with that login
// (src/partitioning/partition-url.ts).
//
// Idempotent: no password in the environment -> nothing to do; no role ->
// a notice (the migration could not create it). The password never appears
// in a log line: it is passed to format(%L) as a bound parameter.
//
// Usage: node prisma/ensure-partition-login.mjs
// Env:   DATABASE_URL (the migrator), PARTITION_DB_PASSWORD (optional).
import { fileURLToPath } from 'node:url';

export const ROLE = 'lawbid_partition';

/** What to do; pure. */
export function plan({ password, roleExists }) {
  if (!password || !password.trim()) return 'skip_no_password';
  if (!roleExists) return 'skip_no_role';
  return 'set_password';
}

export async function ensurePartitionLogin({ prisma, password, log = console.log }) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT 1 AS ok FROM pg_roles WHERE rolname = $1',
    ROLE,
  );
  const step = plan({ password, roleExists: rows.length > 0 });
  if (step === 'skip_no_password') {
    log('partition login: PARTITION_DB_PASSWORD not set, nothing to do');
    return step;
  }
  if (step === 'skip_no_role') {
    log(`partition login: role ${ROLE} does not exist (see docs/runbooks/table-partitioning.md)`);
    return step;
  }
  const [{ stmt }] = await prisma.$queryRawUnsafe(
    `SELECT format('ALTER ROLE ${ROLE} WITH LOGIN PASSWORD %L', $1::text) AS stmt`,
    password.trim(),
  );
  await prisma.$executeRawUnsafe(stmt);
  log(`partition login: password of ${ROLE} set`);
  return step;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { rawClient } = await import('./pg-client.mjs');
  const prisma = rawClient(process.env.DATABASE_URL);
  try {
    await ensurePartitionLogin({ prisma, password: process.env.PARTITION_DB_PASSWORD });
  } catch (e) {
    // Never print the statement: it carries the password.
    console.error(`partition login: failed (${e?.code ?? 'error'}); the conversion stays off until the next run`);
    process.exitCode = 0;
  } finally {
    await prisma.$disconnect();
  }
}
