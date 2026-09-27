#!/usr/bin/env node
/**
 * docs/02_DATABASE.md §8, stage 2.7 acceptance: "миграции применяются на
 * чистой БД и на БД из предыдущей версии". The clean-DB half is the CI
 * `prisma migrate deploy` step (and every e2e run); this script is the
 * other half — an UPGRADE from the previous migration set, with data in
 * the database, exactly as a production deploy runs it (§7.1: migrations
 * run as a separate job before the API rollout).
 *
 *   1. Resolve the previous migration set (see resolvePrevious below).
 *   2. CREATE a throwaway database  <dev db>_prevmig_<random>.
 *   3. `prisma migrate deploy` ONLY the previous set (files taken from git
 *      at the previous ref, so an edited already-applied migration is
 *      caught — §7.1 "Нельзя править применённые миграции").
 *   4. Seed representative rows (users, identifiers, sessions with
 *      duplicate / null device ids, blocked domains, reference data) with
 *      raw SQL that only touches tables present at that version.
 *   5. `prisma migrate deploy` the current migrations on top (the upgrade).
 *   6. Assert: every migration applied; `prisma migrate diff` against
 *      schema.prisma reports NO drift; introspection sees > 50 models (a
 *      schema-engine panic makes diff silently report "no drift"); every
 *      seeded row survived.
 *   7. DROP the throwaway database — only the one this run created.
 *
 * Previous migration set, first match wins:
 *   a. MIGRATE_PREV_REF=<git ref> (or --prev-ref <ref>): the set at that ref.
 *   b. The newest git tag whose migration set is a strict prefix of the
 *      current one (= the last release).
 *   c. Otherwise: the set just before the newest migration change — i.e.
 *      at the first parent of the last commit that touched
 *      prisma/migrations, or at HEAD when the working tree has new
 *      uncommitted migrations. On a feature branch that is the branch's
 *      base; on master it is the release before the last migration.
 * CI needs git history for (b)/(c): actions/checkout with fetch-depth: 0.
 *
 * Usage: node scripts/migrate-from-previous.mjs [--prev-ref <ref>] [--keep]
 * Env:   DATABASE_URL (else apps/api/.env) — only its server is used; the
 *        database named in it is never modified.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(API_DIR, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(API_DIR, 'prisma', 'migrations');
const MIN_MODELS = 50;
const THROWAWAY_INFIX = '_prevmig_';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const KEEP = args.includes('--keep');

function log(msg) {
  process.stdout.write(`[migrate-from-previous] ${msg}\n`);
}

function fail(msg) {
  throw new Error(msg);
}

function loadDatabaseUrl() {
  const envFile = join(API_DIR, '.env');
  if (existsSync(envFile)) {
    const parsed = parseEnv(readFileSync(envFile, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL is not set (env or apps/api/.env)');
  return url;
}

function withDatabase(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: API_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(...gitArgs) {
  try {
    return git(...gitArgs);
  } catch {
    return null;
  }
}

function currentMigrations() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(join(MIGRATIONS_DIR, d.name, 'migration.sql')),
    )
    .map((d) => d.name)
    .sort();
}

const REPO_PREFIX = () => git('rev-parse', '--show-prefix'); // "apps/api/"

function migrationsAtRef(ref) {
  // ls-tree paths are relative to the cwd (apps/api).
  const out = tryGit('ls-tree', '--name-only', ref, 'prisma/migrations/');
  if (out === null) return null;
  return out
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop())
    .filter((name) => /^\d{12,14}_/.test(name))
    .sort();
}

function isStrictPrefix(prev, current) {
  return (
    prev.length < current.length && prev.every((name, i) => current[i] === name)
  );
}

function resolvePrevious(current) {
  const explicit = argValue('--prev-ref') ?? process.env.MIGRATE_PREV_REF;
  if (explicit) {
    const set = migrationsAtRef(explicit);
    if (!set) fail(`cannot read migrations at ref ${explicit}`);
    return { ref: explicit, set, how: 'explicit ref' };
  }

  const tags = (tryGit('tag', '--sort=-creatordate') ?? '')
    .split('\n')
    .filter(Boolean);
  for (const tag of tags) {
    const set = migrationsAtRef(tag);
    if (set && isStrictPrefix(set, current)) {
      return { ref: tag, set, how: `latest release tag ${tag}` };
    }
  }

  const headSet = migrationsAtRef('HEAD');
  if (headSet && isStrictPrefix(headSet, current)) {
    return { ref: 'HEAD', set: headSet, how: 'HEAD (uncommitted new migrations)' };
  }
  const last = tryGit(
    'log',
    '-1',
    '--format=%H',
    '--',
    `${API_DIR}/prisma/migrations`,
  );
  if (last) {
    const parent = tryGit('rev-parse', '--verify', '--quiet', `${last}^1`);
    if (parent) {
      const set = migrationsAtRef(parent);
      if (set) {
        return {
          ref: parent,
          set,
          how: `parent of the last migrations commit ${last.slice(0, 10)}`,
        };
      }
    }
  }
  fail(
    'cannot determine the previous migration set (no git history?). ' +
      'Set MIGRATE_PREV_REF or check out with full history (fetch-depth: 0).',
  );
}

function prisma(prismaArgs, env, { allowExit = [0] } = {}) {
  const res = spawnSync('npx', ['prisma', ...prismaArgs], {
    cwd: API_DIR,
    env: { ...process.env, ...env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowExit.includes(res.status ?? -1)) {
    process.stderr.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
    fail(`prisma ${prismaArgs[0]} ${prismaArgs[1] ?? ''} exited ${res.status}`);
  }
  return res;
}

/** Previous migration files straight from git (not the working tree). */
function stagePrevious(prev, stageDir) {
  const migDir = join(stageDir, 'migrations');
  mkdirSync(migDir, { recursive: true });
  cpSync(SCHEMA, join(stageDir, 'schema.prisma'));
  cpSync(
    join(MIGRATIONS_DIR, 'migration_lock.toml'),
    join(migDir, 'migration_lock.toml'),
  );
  const prefix = REPO_PREFIX();
  for (const name of prev.set) {
    const sql = git('show', `${prev.ref}:${prefix}prisma/migrations/${name}/migration.sql`);
    const current = readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8').trim();
    if (sql !== current) {
      fail(
        `migration ${name} differs from its version at ${prev.ref}: ` +
          'applied migrations must never be edited (docs/02 §7.1)',
      );
    }
    mkdirSync(join(migDir, name));
    writeFileSync(join(migDir, name, 'migration.sql'), `${sql}\n`);
  }
  return join(stageDir, 'schema.prisma');
}

async function tableExists(db, table) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    table,
  );
  return rows.length > 0;
}

/** Representative rows at the PREVIOUS schema. Only core columns that
 * exist since the first auth migration are used; each block is skipped if
 * its table does not exist yet at that version. Returns table -> count. */
async function seedPrevious(db) {
  const seeded = {};
  const run = async (table, statements) => {
    if (!(await tableExists(db, table))) return;
    for (const sql of statements) await db.$executeRawUnsafe(sql);
    const [{ n }] = await db.$queryRawUnsafe(
      `SELECT count(*)::INT AS n FROM "${table}"`,
    );
    seeded[table] = Number(n);
  };
  const u = Array.from({ length: 4 }, () => crypto.randomUUID());
  await run('users', [
    `INSERT INTO users (id, role, status, email, email_verified_at, phone_e164, updated_at)
     VALUES ('${u[0]}', 'client', 'active', 'prev-client@example.com', now(), '+12025550100', now()),
            ('${u[1]}', 'attorney', 'active', NULL, NULL, '+12025550101', now()),
            ('${u[2]}', 'client', 'deleted', NULL, NULL, NULL, now()),
            ('${u[3]}', 'client', 'suspended', 'prev-susp@example.com', NULL, NULL, now())`,
  ]);
  await run('user_identifiers', [
    `INSERT INTO user_identifiers (user_id, provider, provider_uid, verified_at, updated_at)
     VALUES ('${u[0]}', 'phone', '+12025550100', now(), now()),
            ('${u[0]}', 'email', 'prev-client@example.com', now(), now()),
            ('${u[1]}', 'phone', '+12025550101', now(), now())`,
  ]);
  const hasChain = (
    await db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'sessions' AND column_name = 'session_chain_id'`,
    )
  ).length > 0;
  const sessionRows = [];
  for (let i = 0; i < 12; i++) {
    const user = u[i % 2];
    const device = i % 4 === 3 ? 'NULL' : `'prev-device-${i % 3}'`;
    const revoked = i % 2 === 0 ? `now() - INTERVAL '${i} days'` : 'NULL';
    const reason = i % 2 === 0 ? `'rotated'` : 'NULL';
    const chain = hasChain ? `, gen_random_uuid()` : '';
    sessionRows.push(
      `('${user}', ${device}, '${randomBytes(24).toString('hex')}', now() + INTERVAL '${i - 3} days', ${revoked}, ${reason}, now()${chain})`,
    );
  }
  await run('sessions', [
    `INSERT INTO sessions (user_id, device_id, refresh_hash, expires_at, revoked_at, revoked_reason, updated_at${hasChain ? ', session_chain_id' : ''})
     VALUES ${sessionRows.join(',\n')}`,
  ]);
  await run('blocked_email_domains', [
    `INSERT INTO blocked_email_domains (domain, reason)
     VALUES ('privaterelay.appleid.com', 'apple_relay'), ('mailinator.com', 'disposable')`,
  ]);
  await run('states', [
    `INSERT INTO states (code, name) VALUES ('NY', 'New York'), ('CA', 'California')`,
  ]);
  return seeded;
}

async function main() {
  const baseUrl = loadDatabaseUrl();
  const baseDb = new URL(baseUrl).pathname.slice(1) || 'defaultdb';
  const current = currentMigrations();
  const prev = resolvePrevious(current);
  if (!isStrictPrefix(prev.set, current)) {
    const missing = prev.set.filter((n) => !current.includes(n));
    fail(
      missing.length > 0
        ? `migrations present at ${prev.ref} are gone now: ${missing.join(', ')}`
        : `no new migrations after ${prev.ref}, or a new migration sorts before an already-released one`,
    );
  }
  const pending = current.slice(prev.set.length);
  log(`previous set: ${prev.set.length} migrations (${prev.how})`);
  log(`upgrade applies ${pending.length}: ${pending.join(', ')}`);

  const dbName = `${baseDb}${THROWAWAY_INFIX}${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  if (!/^[a-z0-9_]+$/.test(dbName)) fail(`unsafe database name ${dbName}`);
  const url = withDatabase(baseUrl, dbName);
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  const stageDir = mkdtempSync(join(tmpdir(), 'lawbid-prevmig-'));
  let created = false;
  let ok = false;

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    created = true;
    log(`created throwaway database ${dbName}`);

    const prevSchema = stagePrevious(prev, stageDir);
    prisma(['migrate', 'deploy', '--schema', prevSchema], { DATABASE_URL: url });
    log('previous migration set applied');

    const db = new PrismaClient({ datasourceUrl: url });
    let seeded;
    try {
      seeded = await seedPrevious(db);
    } finally {
      await db.$disconnect();
    }
    log(`seeded: ${JSON.stringify(seeded)}`);

    prisma(['migrate', 'deploy', '--schema', SCHEMA], { DATABASE_URL: url });
    log('current migrations applied on top');

    const status = prisma(['migrate', 'status', '--schema', SCHEMA], {
      DATABASE_URL: url,
    });
    if (!/Database schema is up to date/.test(status.stdout)) {
      process.stderr.write(status.stdout);
      fail('migrate status: not all migrations applied');
    }

    const pulled = prisma(['db', 'pull', '--print', '--schema', SCHEMA], {
      DATABASE_URL: url,
    });
    const models = (pulled.stdout.match(/^model /gm) ?? []).length;
    if (models <= MIN_MODELS) {
      fail(`introspection found ${models} models (expected > ${MIN_MODELS})`);
    }
    log(`introspection: ${models} models`);

    const diff = prisma(
      [
        'migrate',
        'diff',
        '--from-url',
        url,
        '--to-schema-datamodel',
        SCHEMA,
        '--exit-code',
      ],
      {},
      { allowExit: [0, 2] },
    );
    if (diff.status !== 0) {
      process.stderr.write(diff.stdout);
      fail('drift: the upgraded database differs from schema.prisma');
    }
    log('no drift between upgraded database and schema.prisma');

    const check = new PrismaClient({ datasourceUrl: url });
    try {
      for (const [table, n] of Object.entries(seeded)) {
        const [{ n: after }] = await check.$queryRawUnsafe(
          `SELECT count(*)::INT AS n FROM "${table}"`,
        );
        if (Number(after) !== n) {
          fail(`seeded rows lost in ${table}: ${n} before, ${after} after`);
        }
      }
    } finally {
      await check.$disconnect();
    }
    log('all seeded rows survived the upgrade');
    ok = true;
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
    if (created && !KEEP) {
      // Only ever the database this run created (exact name).
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" CASCADE`);
      log(`dropped ${dbName}`);
    } else if (created) {
      log(`--keep: left ${dbName} in place`);
    }
    await admin.$disconnect();
  }
  if (ok) log('MIGRATE_FROM_PREVIOUS_OK');
}

main().catch((error) => {
  process.stderr.write(`[migrate-from-previous] FAILED: ${error.message}\n`);
  process.exit(1);
});
