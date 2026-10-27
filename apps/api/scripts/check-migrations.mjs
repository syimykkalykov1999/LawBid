#!/usr/bin/env node
// Zero maintenance (owner 2026-10-05): migrations are expand/contract only
// (docs/02 §7.1), so the previous release keeps working during a rolling
// deploy and the one-button rollback (.github/workflows/rollback.yml) never
// meets a schema it cannot read. This check refuses, in every migration
// newer than BASELINE, the statements that break the running release:
// dropping or renaming a table or column, changing a column's type, and
// adding a NOT NULL column without a DEFAULT (computed columns are fine).
//
// A contract step that is really meant (the old release no longer reads
// the column) carries a line `-- migration-safety: contract <why>` in the
// same file; the check then lets it through and prints the reason.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_BASELINE = '20261014100000_postgres_baseline';
// Tests point the check at sample folders: `node check-migrations.mjs <dir> [baseline] [online-ddl-from]`.
const dir = process.argv[2] ?? join(import.meta.dirname, '..', 'prisma', 'migrations');
const BASELINE = process.argv[3] ?? DEFAULT_BASELINE;
// Online DDL (docs/architecture/ONLINE_DDL.md): Squawk judges only the migrations
// THIS change adds (new folders relative to the merge-base with the target branch),
// never ones already on main and never another PR's. See newMigrationNames().
const concurrentDir = join(dir, '..', 'concurrent');

const RULES = [
  [/\bDROP\s+TABLE\b/i, 'drops a table'],
  [/\bDROP\s+COLUMN\b/i, 'drops a column'],
  [/\bRENAME\s+(COLUMN\s+|TO\b)/i, 'renames a table or column'],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, 'changes a column type'],
  [/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+[^,;]*\bNOT\s+NULL\b(?![^,;]*\b(?:DEFAULT|AS)\b)/i, 'adds a NOT NULL column without DEFAULT'],
];

// Widening a text column (`ALTER COLUMN x TYPE VARCHAR(n)` / `STRING(n)`
// without USING) is a safe expand step: the previous release reads and
// writes the same values, and a rollback only meets longer values it never
// writes. The script cannot see the old length, so a narrowing change must
// still be reviewed by hand (it needs a USING clause or a waiver in practice).
const WIDENING =
  /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\s+(?:VARCHAR|STRING|CHAR(?:ACTER)?(?:\s+VARYING)?)\s*\(\s*\d+\s*\)(?![^;,]*\bUSING\b)/gi;

const stripComments = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

let failed = 0;
const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name > BASELINE)
  .map((d) => d.name)
  .sort();
for (const name of names) {
  const raw = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
  const waiver = /^--\s*migration-safety:\s*contract\b(.*)$/im.exec(raw);
  const sql = stripComments(raw).replace(WIDENING, '');
  for (const [re, what] of RULES) {
    if (!re.test(sql)) continue;
    if (waiver) {
      console.log(`${name}: ${what} — allowed (contract:${waiver[1] || ' no reason given'})`);
    } else {
      console.error(
        `${name}: ${what}. Not safe for a rolling deploy / rollback. ` +
          'Split it: add the new shape now, remove the old one in a later release, ' +
          'and mark that later migration with "-- migration-safety: contract <why>".',
      );
      failed++;
    }
  }
}
console.log(`checked ${names.length} migration(s) after ${BASELINE}`);

// The migrations this change itself adds: folders whose migration.sql is ADDED in
// `git diff --diff-filter=A <base>...HEAD` (three dots = since the merge-base, so
// migrations that landed on the target branch meanwhile are not counted).
//   PR      ONLINE_DDL_BASE=origin/<target branch>  (api-ci.yml)
//   push    ONLINE_DDL_BASE=<github.event.before>   -> only what that push added
//   local   defaults to origin/main
// Tests / manual runs: argv[4] (or ONLINE_DDL_ONLY) = comma-separated folder names, or `none`.
function newMigrationNames() {
  const explicit = process.argv[4] ?? process.env.ONLINE_DDL_ONLY;
  if (explicit !== undefined) {
    const wanted = explicit === 'none' ? [] : explicit.split(',').filter(Boolean);
    return names.filter((n) => wanted.includes(n));
  }
  const base = process.env.ONLINE_DDL_BASE || 'origin/main';
  const isRef = base.startsWith('origin/');
  if (/^0+$/.test(base)) {
    console.log('online DDL: no previous commit for this push (new branch): nothing to lint');
    return [];
  }
  const git = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).status !== 0) {
    if (isRef) {
      console.error(`online DDL: cannot resolve ${base}; fetch it (actions/checkout fetch-depth: 0) or set ONLINE_DDL_BASE`);
      failed++;
    } else {
      console.warn(`online DDL: previous commit ${base} is not available: nothing to lint`);
    }
    return [];
  }
  const r = git(['diff', '--name-only', '--relative', '--diff-filter=A', `${base}...HEAD`, '--', '.']);
  if (r.status !== 0) {
    console.error(`online DDL: git diff failed: ${r.stderr}`);
    failed++;
    return [];
  }
  const added = new Set(
    r.stdout
      .split('\n')
      .map((f) => /^([^/]+)\/migration\.sql$/.exec(f)?.[1])
      .filter(Boolean),
  );
  return names.filter((n) => added.has(n));
}

// --- online DDL: Squawk (ready-made linter) + the prisma/concurrent folder ---
const squawkBin = process.env.SQUAWK_BIN || 'squawk';
const squawkConfig = join(import.meta.dirname, '..', '.squawk.toml');
function squawk(files, extra, label) {
  if (!files.length) return;
  const r = spawnSync(squawkBin, ['-c', squawkConfig, '--reporter', 'gcc', ...extra, ...files], {
    encoding: 'utf8',
  });
  if (r.error) {
    if (process.env.CI) {
      console.error(`squawk is not installed (${r.error.message}); CI installs it, see api-ci.yml`);
      failed++;
    } else {
      console.warn(`squawk not found: skipped online-DDL lint of ${label} (npm i -g squawk-cli@2.70.0, or SQUAWK_BIN=...)`);
    }
    return;
  }
  if (r.status !== 0) {
    console.error(
      `${r.stdout}${r.stderr}\nOnline DDL (${label}): rewrite the migration the safe way ` +
        'or, for a tiny / brand-new table, put `-- squawk-ignore <rule>` above the statement and the reason in a comment line before it. ' +
        'docs/architecture/ONLINE_DDL.md',
    );
    failed++;
  }
}
const online = newMigrationNames().map((n) => join(dir, n, 'migration.sql'));
squawk(online, [], `${online.length} migration(s) added by this change`);

// prisma/concurrent/*.sql run outside a transaction, one statement at a time
// (prisma/run-concurrent.mjs): only index builds that can be done that way.
const ALLOWED_CONCURRENT = [
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+("[^"]+"|\w+)\s/i,
  /^DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s/i,
  /^REINDEX\s+(?:INDEX|TABLE)\s+CONCURRENTLY\s/i,
];
if (existsSync(concurrentDir)) {
  const files = readdirSync(concurrentDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(f)) {
      console.error(`concurrent/${f}: name must be <14 digits>_<snake_name>.sql`);
      failed++;
    }
    const sql = stripComments(readFileSync(join(concurrentDir, f), 'utf8'));
    for (const st of sql.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
      if (!ALLOWED_CONCURRENT.some((re) => re.test(st))) {
        console.error(
          `concurrent/${f}: "${st.slice(0, 60)}": only CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <name> …, ` +
            'DROP INDEX CONCURRENTLY IF EXISTS … and REINDEX … CONCURRENTLY belong here',
        );
        failed++;
      }
    }
  }
  // The runner sets lock_timeout itself; no transaction wraps these files.
  squawk(
    files.map((f) => join(concurrentDir, f)),
    // --exclude replaces the config's list for this call, so keep the timeout rule out too.
    ['--no-assume-in-transaction', '--exclude', 'require-lock-timeout,require-statement-timeout'],
    `${files.length} concurrent file(s)`,
  );
  console.log(`checked ${files.length} concurrent file(s)`);
}
process.exit(failed ? 1 : 0);
