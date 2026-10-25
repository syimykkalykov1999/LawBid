#!/usr/bin/env node
// Runs prisma/concurrent/*.sql AFTER `prisma migrate deploy`
// (docs/architecture/ONLINE_DDL.md).
//
// Why: Prisma wraps a multi-statement migration.sql in one transaction and
// PostgreSQL refuses CREATE INDEX CONCURRENTLY inside a transaction block
// (https://www.postgresql.org/docs/current/sql-createindex.html). A lone
// statement works, but a failed build then leaves an INVALID index AND a
// failed migration that blocks every later deploy (Prisma P3009). Same
// split as GitLab's `disable_ddl_transaction!` migrations and Rails'
// `algorithm: :concurrently`: index builds live outside the migration
// transaction, are tracked in a table (concurrent_migrations), and a failed
// build is cleaned up and retried on the next run.
//
// Rules for a file: only CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS
// <name>, DROP INDEX CONCURRENTLY IF EXISTS and REINDEX .. CONCURRENTLY
// (enforced by scripts/check-migrations.mjs). Every statement is idempotent,
// so the file can be re-run after any crash.
//
// Usage: node prisma/run-concurrent.mjs [--dir=prisma/concurrent]
// Env:   DATABASE_URL (the migrator role; direct, not the pooler).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRIES = 6;

export function splitStatements(raw) {
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createdIndexName(stmt) {
  const m = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+("[^"]+"|\w+)/i.exec(stmt);
  return m ? m[1].replace(/"/g, '') : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isLockTimeout = (e) => /lock timeout|55P03/i.test(String(e?.message ?? e));

/** `prisma` needs ONE connection (SET lock_timeout is per session). */
export async function runConcurrent({ prisma, dir, log = console.log }) {
  await prisma.$executeRawUnsafe('SET lock_timeout = ' + LOCK_TIMEOUT_MS);
  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Map(
    (await prisma.$queryRawUnsafe('SELECT name, checksum FROM concurrent_migrations')).map((r) => [r.name, r.checksum]),
  );
  let applied = 0;
  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(raw).digest('hex');
    if (done.has(file)) {
      if (done.get(file) !== checksum) log(`WARN ${file}: edited after it was applied; not run again (add a new file instead)`);
      continue;
    }
    for (const stmt of splitStatements(raw)) {
      const name = createdIndexName(stmt);
      if (name) await dropInvalidLeftover(prisma, name, log);
      await withLockRetries(() => prisma.$executeRawUnsafe(stmt), file, log);
      if (name) {
        const rows = await prisma.$queryRawUnsafe(
          'SELECT i.indisvalid AS ok FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1',
          name,
        );
        if (!rows.length || !rows[0].ok) throw new Error(`${file}: index ${name} is not valid after the build`);
      }
    }
    await prisma.$executeRawUnsafe(
      'INSERT INTO concurrent_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      file,
      checksum,
    );
    log(`applied ${file}`);
    applied++;
  }
  log(`concurrent migrations: ${applied} applied, ${files.length - applied} already done`);
  return applied;
}

/** A killed CREATE INDEX CONCURRENTLY leaves an INVALID index that
 * `IF NOT EXISTS` would silently accept: drop it (unless a build of it is
 * running right now) so the statement builds a fresh one. */
async function dropInvalidLeftover(prisma, name, log) {
  const bad = await prisma.$queryRawUnsafe(
    'SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1 AND NOT i.indisvalid',
    name,
  );
  if (!bad.length) return;
  const running = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state <> 'idle'
       AND query ILIKE '%create%index%concurrently%' AND query ILIKE '%' || $1 || '%'`,
    name,
  );
  if (running.length) throw new Error(`index ${name} is being built by another session; try again later`);
  log(`dropping invalid leftover index ${name}`);
  await prisma.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${name.replace(/"/g, '""')}"`);
}

async function withLockRetries(fn, file, log) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isLockTimeout(e) || attempt >= LOCK_RETRIES) throw new Error(`${file}: ${e?.message ?? e}`);
      log(`${file}: lock busy, retry ${attempt}/${LOCK_RETRIES - 1}`);
      await sleep(Math.min(30000, 2000 * attempt * attempt));
    }
  }
}

export function singleConnectionUrl(url) {
  const u = new URL(url);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { PrismaClient } = await import('@prisma/client');
  const arg = process.argv.find((a) => a.startsWith('--dir='));
  const dir = arg ? arg.slice(6) : join(import.meta.dirname, 'concurrent');
  const prisma = new PrismaClient({ datasourceUrl: singleConnectionUrl(process.env.DATABASE_URL) });
  try {
    await runConcurrent({ prisma, dir });
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
