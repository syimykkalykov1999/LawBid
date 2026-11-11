#!/usr/bin/env node
// Owner 2026-11-11 («второй сервер базы одной кнопкой»): prepares every
// extra physical database the admin switch created, in the migrate task,
// after the primary's own `prisma migrate deploy`:
//   1. the same migrations (`prisma migrate deploy`, then prisma/concurrent),
//   2. the runtime roles get the SAME passwords as on the primary (so the
//      app reaches the server with DATABASE_URL's login and only the host
//      swapped — src/sharding/shard-databases.ts, DB_SHARD_HOSTS),
//   3. the per-role timeouts (prisma/role-settings.sql, the copy of
//      infra/postgres/role-settings.sql).
// The migrations run as the server's own master user: Terraform keeps its
// login in the secret `<name>-dbN/postgres-master` (JSON username / password /
// host / port / dbname) and gives it to the migrate task as
// DB_SHARD_MASTER_<KEY> (DB_SHARD_MASTER_DB1). Without it the migrator's URL
// with the host swapped is tried (a server created with the same password).
//
// Idempotent and safe to re-run: migrations skip what is applied, ALTER ROLE
// sets the same password again. No DB_SHARD_HOSTS -> nothing to do (one
// database, exactly as before). Passwords never reach a log line: they are
// bound parameters of format(%L), and URLs are logged by host only.
//
// Usage: node prisma/migrate-shards.mjs
// Env:   DATABASE_URL (the migrator, direct), DB_SHARD_HOSTS ('{"db1":"host"}'),
//        DB_SHARD_MASTER_<KEY> (the server's master secret JSON, optional),
//        DB_SHARD_PORT (optional, 5432), APP_DATABASE_URL and
//        RETENTION_DATABASE_URL (the runtime roles' logins),
//        PARTITION_DB_PASSWORD (optional).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePartitionLogin } from './ensure-partition-login.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** {"db1":"host"} -> [["db1","host"]]; anything else -> []. */
export function shardHosts(raw) {
  if (!raw || !raw.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return Object.entries(parsed).filter(
    ([k, v]) => k !== 'primary' && typeof v === 'string' && v.trim(),
  );
}

/** [url] with another host (and port); same login, database and options. */
export function withHost(url, host, port = '5432') {
  const u = new URL(url);
  u.hostname = host;
  u.port = port;
  return u.toString();
}

/** The migrator URL of shard [key]: its master secret (JSON) with the
 * primary URL's options (sslmode ...), else [base] with the host swapped. */
export function shardMigratorUrl(key, host, base, env, port = '5432') {
  const raw = env[`DB_SHARD_MASTER_${key.toUpperCase().replace(/-/g, '_')}`];
  if (raw && raw.trim()) {
    const m = JSON.parse(raw);
    const u = new URL(base);
    u.username = encodeURIComponent(m.username);
    u.password = encodeURIComponent(m.password);
    u.hostname = m.host || host;
    u.port = String(m.port || port);
    u.pathname = `/${m.dbname || u.pathname.slice(1)}`;
    return u.toString();
  }
  return withHost(base, host, port);
}

/** The role and password of a login URL, or null. */
export function loginOf(url) {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url);
    const role = decodeURIComponent(u.username);
    const password = decodeURIComponent(u.password);
    return role && password ? { role, password } : null;
  } catch {
    return null;
  }
}

/** The ALTER ROLE ... SET lines of role-settings.sql (comments dropped). */
export function roleSettingStatements(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join(' ')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => /^ALTER ROLE [a-z_]+ SET /i.test(s));
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    cwd: join(HERE, '..'),
  });
  if (r.status !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${r.status ?? r.signal})`,
    );
}

export async function migrateShard({
  key,
  url,
  env,
  PrismaClient,
  log = console.log,
}) {
  const host = new URL(url).hostname;
  log(`shard ${key} (${host}): migrations`);
  const childEnv = { ...env, DATABASE_URL: url };
  run('npx', ['prisma', 'migrate', 'deploy'], childEnv);
  run('node', ['prisma/run-concurrent.mjs'], childEnv);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    for (const name of ['APP_DATABASE_URL', 'RETENTION_DATABASE_URL']) {
      const login = loginOf(env[name]);
      if (!login) {
        log(`shard ${key}: ${name} not set, its role keeps no login`);
        continue;
      }
      const exists = await prisma.$queryRawUnsafe(
        'SELECT 1 AS ok FROM pg_roles WHERE rolname = $1',
        login.role,
      );
      if (exists.length === 0) {
        log(
          `shard ${key}: role ${login.role} does not exist (the migrations create it)`,
        );
        continue;
      }
      const [{ stmt }] = await prisma.$queryRawUnsafe(
        "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS stmt",
        login.role,
        login.password,
      );
      await prisma.$executeRawUnsafe(stmt);
      log(`shard ${key}: login of ${login.role} set`);
    }
    await ensurePartitionLogin({
      prisma,
      password: env.PARTITION_DB_PASSWORD,
      log,
    });
    const settings = roleSettingStatements(
      readFileSync(join(HERE, 'role-settings.sql'), 'utf8'),
    );
    for (const s of settings) {
      const role = s.split(/\s+/)[2];
      const exists = await prisma.$queryRawUnsafe(
        'SELECT 1 AS ok FROM pg_roles WHERE rolname = $1',
        role,
      );
      if (exists.length > 0) await prisma.$executeRawUnsafe(s);
    }
    log(`shard ${key}: ${settings.length} role settings applied`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hosts = shardHosts(process.env.DB_SHARD_HOSTS);
  if (hosts.length === 0) {
    console.log('shards: DB_SHARD_HOSTS not set, one database, nothing to do');
    process.exit(0);
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    console.error('shards: DATABASE_URL (the migrator) is not set');
    process.exit(1);
  }
  const { PrismaClient } = await import('@prisma/client');
  try {
    for (const [key, host] of hosts) {
      await migrateShard({
        key,
        url: shardMigratorUrl(
          key,
          host,
          base,
          process.env,
          process.env.DB_SHARD_PORT?.trim() || '5432',
        ),
        env: process.env,
        PrismaClient,
      });
    }
  } catch (e) {
    // Never print a URL or statement: they may carry a password.
    console.error(`shards: failed: ${String(e?.code ?? e?.name ?? 'error')}`);
    process.exit(1);
  }
}
