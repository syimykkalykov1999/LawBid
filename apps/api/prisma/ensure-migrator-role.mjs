#!/usr/bin/env node
// D8 (docs/dev/SECOND_PASS_2026-11-26.md; AWS Well-Architected SEC03-BP02,
// Amazon RDS «Master user account privileges»): migrations run as the narrow
// role lawbid_migrator, not as the RDS master user. docs/runbooks/db-migrator-role.md.
//
// Runs FIRST in the migrate task, as the master user (DATABASE_URL = the
// secret MIGRATOR_DATABASE_URL). Prints ONE line on stdout: the connection
// string the schema steps then use (scripts/deploy/run-migrations.sh,
// infra/modules/ecs `migrate`):
//   MIGRATE_URL="$(node prisma/ensure-migrator-role.mjs)" &&
//   DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy && ...
// Everything else goes to stderr (the task log). Never prints a password.
//
//   - no MIGRATOR_ROLE_PASSWORD (admin switch aws.db_migrator_role off, the
//     Terraform default): prints DATABASE_URL unchanged = exactly as before;
//   - a database without _prisma_migrations (first install): the master user
//     runs the very first migrations (they create the roles), the next run
//     moves the schema;
//   - otherwise: runs prisma/migrator-role.sql (idempotent: creates/narrows the
//     role, hands over the objects, copies default privileges, one statement
//     at a time, lock_timeout 3 s with retries), sets the password, checks the
//     result (checks() below) and logs in as the role. All good: prints the
//     migrator's URL. Anything missing: a line "migrator role: FALLBACK ..."
//     (run-migrations.sh turns it into a warning on the deploy) and prints
//     DATABASE_URL unchanged, so a deploy never breaks on this step; the next
//     run tries again.
//
// Env: DATABASE_URL (the master user, direct), MIGRATOR_ROLE_PASSWORD (optional).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROLE = 'lawbid_migrator';
const HERE = fileURLToPath(new URL('.', import.meta.url));
export const SQL_FILE = join(HERE, 'migrator-role.sql');

const LOCK_TIMEOUT = '3s';
const LOCK_RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isLockTimeout = (e) => e?.code === '55P03' || /lock timeout/i.test(String(e?.message ?? e));

/** The SELECTs of migrator-role.sql (each ends with psql's \gexec). */
export function generatorQueries(sql) {
  return sql
    .split(/^\\gexec[ \t]*$/m)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((l) => !/^\s*--/.test(l))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

/** [url] with the migrator's login; same host, database and options. */
export function migratorUrl(url, password) {
  const u = new URL(url);
  u.username = ROLE;
  u.password = encodeURIComponent(password);
  return u.toString();
}

/** What to do before touching the database; pure. */
export function plan({ password, currentUser, hasMigrationsTable }) {
  if (!password || !password.trim()) return 'off';
  if (currentUser === ROLE) return 'already_migrator';
  if (!hasMigrationsTable) return 'first_install';
  return 'bootstrap';
}

/** Problems that keep the master user on; empty = the role is ready. Pure. */
export function problems(state) {
  const out = [];
  const r = state.role;
  if (!r) return ['role lawbid_migrator does not exist'];
  if (!r.rolcanlogin) out.push('role cannot log in');
  for (const [k, word] of [
    ['rolsuper', 'SUPERUSER'],
    ['rolcreatedb', 'CREATEDB'],
    ['rolcreaterole', 'CREATEROLE'],
    ['rolreplication', 'REPLICATION'],
    ['rolbypassrls', 'BYPASSRLS'],
  ]) {
    if (r[k]) out.push(`role still has ${word}`);
  }
  if (state.memberOfMaster) out.push('role is a member of the master user');
  if (state.memberOfRdsSuperuser) out.push('role is a member of rds_superuser');
  if (state.ownsDatabase) out.push('role owns the database (could drop it)');
  if (state.leftWithMaster > 0) out.push(`${state.leftWithMaster} object(s) in schema public still owned by the master user`);
  if (!state.canCreateInPublic) out.push('role has no CREATE on schema public');
  return out;
}

const STATE_SQL = `
SELECT
  (SELECT row_to_json(r) FROM (
     SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = $1) r) AS role,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
    AND pg_has_role($1, current_user, 'MEMBER') AS "memberOfMaster",
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_superuser')
    AND pg_has_role($1, 'rds_superuser', 'MEMBER') AS "memberOfRdsSuperuser",
  (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) = $1 AS "ownsDatabase",
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
    AND has_schema_privilege($1, 'public', 'CREATE') AS "canCreateInPublic",
  (
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'))
  + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND t.typtype IN ('e', 'd', 'r')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'))
  + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
  )::int AS "leftWithMaster"`;

/** Runs one statement; a lock timeout is retried (one lock at a time). */
async function runStatement(prisma, stmt, log) {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      return true;
    } catch (e) {
      if (isLockTimeout(e) && attempt < LOCK_RETRIES) {
        await sleep(2000 * attempt);
        continue;
      }
      // The statement names objects only (never a password).
      log(`migrator role: step failed (${e?.code ?? 'error'}): ${stmt.slice(0, 160)}`);
      return false;
    }
  }
}

/**
 * Makes the role ready; returns the URL the schema steps use.
 * [connect] opens a client for a URL (the login test).
 */
export async function ensureMigratorRole({ prisma, url, password, connect, sql, log = console.error }) {
  const [{ current_user: currentUser, has_table: hasMigrationsTable }] = await prisma.$queryRawUnsafe(
    `SELECT current_user, to_regclass('public._prisma_migrations') IS NOT NULL AS has_table`,
  );
  const step = plan({ password, currentUser, hasMigrationsTable });
  if (step === 'off') {
    log(`migrator role: off (no MIGRATOR_ROLE_PASSWORD; admin switch aws.db_migrator_role), migrations run as ${currentUser}`);
    return { url, step, role: currentUser };
  }
  if (step === 'already_migrator') {
    log(`migrator role: DATABASE_URL is already ${ROLE}`);
    return { url, step, role: ROLE };
  }
  if (step === 'first_install') {
    log(`migrator role: new database, the first migrations run as ${currentUser}; the next run hands the schema to ${ROLE}`);
    return { url, step, role: currentUser };
  }

  await prisma.$executeRawUnsafe(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  let failed = 0;
  let done = 0;
  for (const q of generatorQueries(sql)) {
    let rows;
    try {
      rows = await prisma.$queryRawUnsafe(q);
    } catch (e) {
      failed += 1;
      log(`migrator role: a check of migrator-role.sql failed (${e?.code ?? 'error'})`);
      continue;
    }
    for (const { stmt } of rows) {
      if (await runStatement(prisma, stmt, log)) done += 1;
      else failed += 1;
    }
  }
  const [{ stmt: setPassword }] = await prisma.$queryRawUnsafe(
    `SELECT format('ALTER ROLE ${ROLE} WITH LOGIN PASSWORD %L', $1::text) AS stmt`,
    password.trim(),
  );
  try {
    await prisma.$executeRawUnsafe(setPassword);
  } catch (e) {
    // Never print the statement: it carries the password.
    failed += 1;
    log(`migrator role: password not set (${e?.code ?? 'error'})`);
  }
  const [state] = await prisma.$queryRawUnsafe(STATE_SQL, ROLE);
  const left = problems(state);
  log(`migrator role: ${done} change(s) applied, ${failed} failed`);
  if (left.length) {
    log(`migrator role: FALLBACK to ${currentUser} (${left.join('; ')}); the next run tries again. docs/runbooks/db-migrator-role.md`);
    return { url, step: 'fallback', role: currentUser, problems: left };
  }

  const target = migratorUrl(url, password.trim());
  let client;
  try {
    client = connect(target);
    const [{ who }] = await client.$queryRawUnsafe('SELECT current_user AS who');
    if (who !== ROLE) throw new Error(`logged in as ${who}`);
  } catch (e) {
    log(`migrator role: FALLBACK to ${currentUser} (login as ${ROLE} failed: ${e?.code ?? 'error'}); the next run tries again`);
    return { url, step: 'fallback', role: currentUser, problems: ['login failed'] };
  } finally {
    await client?.$disconnect().catch(() => {});
  }
  log(`migrator role: ready, migrations run as ${ROLE}`);
  return { url: target, step: 'migrator', role: ROLE };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('migrator role: DATABASE_URL is not set');
    process.exit(1);
  }
  const { rawClient } = await import('./pg-client.mjs');
  const prisma = rawClient(url);
  let out = url;
  try {
    const r = await ensureMigratorRole({
      prisma,
      url,
      password: process.env.MIGRATOR_ROLE_PASSWORD,
      connect: rawClient,
      sql: readFileSync(SQL_FILE, 'utf8'),
    });
    out = r.url;
  } catch (e) {
    console.error(`migrator role: FALLBACK (${e?.code ?? 'error'}: ${String(e?.message ?? e).slice(0, 120)}); migrations run as the master user`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
  process.stdout.write(`${out}\n`);
}
