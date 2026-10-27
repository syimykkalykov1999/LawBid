#!/usr/bin/env node
// S11-3: "N-1 compatibility": the PREVIOUS release's own e2e smoke suites run
// against the schema THIS commit's migrations produce. Rolling deploys keep old
// tasks serving on the new schema for 10-40 minutes and rollback.yml promises the
// previous release keeps working on the current one; nothing tested that.
//
//   node scripts/ci/n1-compat.mjs <previous release checkout>   (run from the repo root)
//
// How it works without touching the old release's code:
//   1. copy THIS commit's prisma/migrations over the previous checkout's, so the
//      old e2e global setup sees "the migrations" = the new ones,
//   2. create the database the old setup will reuse (its name is derived from a
//      hash of the migration set; same algorithm as test/support/e2e-global-setup.ts),
//      `prisma migrate deploy` the new migrations into it and, when the online-DDL
//      runner of PR #347 exists (prisma/run-concurrent.mjs), run it, exactly as
//      run-migrations.sh does in a deploy,
//   3. run the suites named in apps/api/test/n1-suites.json (that exist in the old
//      release) with the OLD code + OLD Prisma client; the old setup finds the
//      database migrated, empties it and the old suites run on the new schema.
// A failing suite is retried once (flaky infra); a second failure fails the job:
// the new migration breaks the release that is live, so it must be split into
// expand now / contract later (docs/02 §7.1).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const prev = resolve(process.argv[2] ?? '');
const here = resolve('apps/api');
if (!process.argv[2] || !existsSync(join(prev, 'apps/api'))) {
  console.error('usage: n1-compat.mjs <previous release checkout>');
  process.exit(2);
}
const prevApi = join(prev, 'apps/api');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts });

// 1. overlay the new migrations
const prevMig = join(prevApi, 'prisma/migrations');
rmSync(prevMig, { recursive: true, force: true });
cpSync(join(here, 'prisma/migrations'), prevMig, { recursive: true });

// 2. the database the old global setup will reuse
const dirs = readdirSync(prevMig, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const h = createHash('sha256');
for (const d of dirs) {
  h.update(d);
  h.update(readFileSync(join(prevMig, d, 'migration.sql')));
}
const hash = h.digest('hex').slice(0, 12);
const base = process.env.DATABASE_URL;
const baseName = new URL(base).pathname.slice(1);
const dbName = `${baseName}_e2e_${hash}`;
const u = new URL(base);
u.pathname = `/${dbName}`;
const url = u.toString();
console.log(`N-1: ${dirs.length} migrations, database ${dbName}`);
// psql rejects Prisma's `?schema=public` query parameter: strip the query for psql.
const psqlUrl = new URL(base);
psqlUrl.search = '';
const created = run('psql', [psqlUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${dbName}"`]);
if (created.status !== 0) process.exit(1);
const env = { ...process.env, DATABASE_URL: url };
// Only the previous checkout has node_modules (the job runs `npm ci` there), so the
// migrations (already copied in above) are applied with ITS Prisma CLI; `npx prisma`
// in this checkout would download the newest Prisma from the registry instead.
if (run('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], { cwd: prevApi, env }).status !== 0) process.exit(1);
if (existsSync(join(here, 'prisma/run-concurrent.mjs'))) {
  console.log('N-1: running prisma/concurrent (online-DDL runner)');
  // Same reason: the runner imports @prisma/client, which resolves next to the file.
  cpSync(join(here, 'prisma/run-concurrent.mjs'), join(prevApi, 'prisma/run-concurrent.mjs'));
  const conc = join(here, 'prisma/concurrent');
  if (existsSync(conc)) {
    rmSync(join(prevApi, 'prisma/concurrent'), { recursive: true, force: true });
    cpSync(conc, join(prevApi, 'prisma/concurrent'), { recursive: true });
  }
  if (run('node', ['prisma/run-concurrent.mjs'], { cwd: prevApi, env }).status !== 0) process.exit(1);
}

// 3. the old suites, on the new schema
const cfg = JSON.parse(readFileSync(join(here, 'test/n1-suites.json'), 'utf8'));
const paths = cfg.suites.map((s) => `test/${s}.e2e-spec.ts`).filter((p) => existsSync(join(prevApi, p)));
const skipped = cfg.suites.length - paths.length;
console.log(`N-1: ${paths.length} suite(s) of the previous release${skipped ? ` (${skipped} not present there)` : ''}`);
if (paths.length === 0) {
  console.log('nothing to run');
  process.exit(0);
}
const jest = (files, out) =>
  run('npx', ['jest', '--config', './test/jest-e2e.json', '--forceExit', '--runTestsByPath', ...files, '--json', `--outputFile=${out}`], {
    cwd: prevApi,
    env: process.env,
  });
const failed = (out) => {
  try {
    return JSON.parse(readFileSync(out, 'utf8')).testResults.filter((t) => t.status === 'failed').map((t) => t.name.replace(`${prevApi}/`, ''));
  } catch {
    return null;
  }
};
const out1 = join(process.env.RUNNER_TEMP ?? '/tmp', 'n1-1.json');
let r = jest(paths, out1);
if (r.status !== 0) {
  const bad = failed(out1);
  console.warn(`N-1: retrying once: ${bad === null ? 'all suites (no result file)' : bad.join(', ')}`);
  r = jest(bad ?? paths, join(process.env.RUNNER_TEMP ?? '/tmp', 'n1-2.json'));
}
if (r.status !== 0) {
  console.error(
    '::error::N-1 failed: the previous release does not work on the schema of this change. ' +
      'Make the migration an expand step now and the contract step in a later release (docs/02_DATABASE.md §7.1).',
  );
  process.exit(1);
}
console.log('N-1 ok: the previous release runs on the new schema');
