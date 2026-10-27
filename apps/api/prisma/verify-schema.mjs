#!/usr/bin/env node
// Runs in the migrate task AFTER `prisma migrate deploy` and
// run-concurrent.mjs (scripts/deploy/run-migrations.sh), BEFORE any service
// rolls. Deploy safety audit 2026-10-27
// (docs/dev/DEPLOY_SAFETY_AUDIT_2026-10-27.md, finding "partition skip").
//
// Why: a few migrations are guarded and may do NOTHING on a busy or big
// production table while Prisma still records them as applied — e.g.
// 20261107131300_partition_messages_notifications returns 'skipped: busy'
// with only a NOTICE. CI always runs them on an empty database, so CI is
// green, but the new code expects the new columns/keys and would answer
// 500 (P2022) on reactions, edits, hides and saved messages. The same
// check CI runs ("No drift between schema.prisma and migrations",
// api-ci.yml) is run here against the REAL database: if the database does
// not match schema.prisma of this image, the deploy stops before the new
// api starts. Old tasks keep running (every migration is expand-only).
//
// SCHEMA_DRIFT_CHECK: fail (default) | warn | off — repository variable,
// passed in by run-migrations.sh. Prints table/column names only.
import { spawnSync } from 'node:child_process';

const mode = (process.env.SCHEMA_DRIFT_CHECK || 'fail').trim().toLowerCase();
if (mode === 'off') {
  console.log('schema check: off (SCHEMA_DRIFT_CHECK=off)');
  process.exit(0);
}

function prisma(args) {
  return spawnSync('npx', ['prisma', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
}

// Introspection guard (same as CI): when the schema engine cannot read the
// database, `migrate diff` prints nothing and exits 0 — a silent "no drift".
const pull = prisma(['db', 'pull', '--print']);
const models = (pull.stdout.match(/^model /gm) || []).length;
if (pull.status !== 0 || models === 0) {
  const msg = `schema check: could not introspect the database (exit ${pull.status}, ${models} models)`;
  console.log(mode === 'warn' ? `WARN ${msg}` : `ERROR ${msg}`);
  process.exit(mode === 'warn' ? 0 : 1);
}

const diff = prisma([
  'migrate',
  'diff',
  '--from-schema-datasource',
  'prisma/schema.prisma',
  '--to-schema-datamodel',
  'prisma/schema.prisma',
  '--exit-code',
]);
if (diff.status === 0) {
  console.log(`schema check: database matches schema.prisma (${models} models)`);
  process.exit(0);
}
const summary = `${diff.stdout || ''}${diff.stderr || ''}`
  .split('\n')
  .filter((l) => l.trim())
  .slice(0, 60)
  .map((l) => l.replace(/[a-z]+:\/\/\S+/gi, '<url>').slice(0, 200))
  .join('\n');
console.log(
  `${mode === 'warn' ? 'WARN' : 'ERROR'} schema check: the database differs from schema.prisma of this image ` +
    `(a guarded migration skipped its work, or a hand change on the server). ` +
    `The new api would fail on these tables. See docs/runbooks/migrate-resolve.md «Schema check».\n${summary}`,
);
process.exit(mode === 'warn' ? 0 : diff.status === 2 ? 2 : 1);
