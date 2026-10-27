// node --test scripts/check-migrations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = join(import.meta.dirname, 'check-migrations.mjs');

function run(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  mkdirSync(join(dir, '20260101000000_base'));
  mkdirSync(join(dir, '20270101000000_sample'));
  writeFileSync(join(dir, '20270101000000_sample', 'migration.sql'), sql);
  // 4th argument `none`: no sample is judged by Squawk here (that lint has its own checks).
  return spawnSync('node', [script, dir, '20260101000000_base', 'none'], { encoding: 'utf8' });
}

const bad = {
  'drop column': 'ALTER TABLE "a" DROP COLUMN "b";',
  'drop table': 'DROP TABLE "a";',
  'rename column': 'ALTER TABLE "a" RENAME COLUMN "b" TO "c";',
  'rename table': 'ALTER TABLE "a" RENAME TO "z";',
  'change type': 'ALTER TABLE "a" ALTER COLUMN "b" TYPE INTEGER USING "b"::integer;',
  'not null without default': 'ALTER TABLE "a" ADD COLUMN "b" TEXT NOT NULL;',
};
for (const [name, sql] of Object.entries(bad)) {
  test(`rejects ${name}`, () => {
    assert.equal(run(sql).status, 1);
  });
  test(`allows ${name} with the contract marker`, () => {
    const r = run(`-- migration-safety: contract old release no longer reads it (#123)\n${sql}`);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /allowed/);
  });
}
test('allows additive changes', () => {
  const sql =
    'ALTER TABLE "a" ADD COLUMN "v" INTEGER NOT NULL DEFAULT 0;\nALTER TABLE "a" ADD COLUMN "n" TEXT;\nCREATE INDEX "i" ON "a"("n");';
  assert.equal(run(sql).status, 0);
});
test('a DROP inside a comment is ignored', () => {
  assert.equal(run('-- we never DROP COLUMN here\nALTER TABLE "a" ADD COLUMN "n" TEXT;').status, 0);
});

// --- the online-DDL (Squawk) lint judges only what THIS change adds ---
// A stub `squawk` records the files it is asked to lint (the real binary has its own tests).
function scoped() {
  const root = mkdtempSync(join(tmpdir(), 'scope-'));
  const git = (...a) => {
    const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  const mig = (name) => {
    mkdirSync(join(root, 'prisma', 'migrations', name), { recursive: true });
    writeFileSync(join(root, 'prisma', 'migrations', name, 'migration.sql'), 'SELECT 1;\n');
  };
  const log = join(root, 'squawk.log');
  const stub = join(root, 'squawk-stub.sh');
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
  chmodSync(stub, 0o755);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  mig('20260101000000_base');
  mig('20260201000000_already_on_main');
  git('add', '-A');
  git('commit', '-q', '-m', 'main');
  git('branch', 'target');
  git('checkout', '-q', '-b', 'pr');
  mig('20260301000000_added_by_the_pr');
  git('add', '-A');
  git('commit', '-q', '-m', 'pr');
  // main moves on with someone else's migration: it must not be judged either
  git('checkout', '-q', 'target');
  mig('20260215000000_other_prs_migration');
  git('add', '-A');
  git('commit', '-q', '-m', 'other');
  git('checkout', '-q', 'pr');
  git('merge', '-q', '--no-edit', 'target');
  const run = (base) =>
    spawnSync('node', [script, join(root, 'prisma', 'migrations'), '20260101000000_base'], {
      encoding: 'utf8',
      env: { ...process.env, SQUAWK_BIN: stub, ONLINE_DDL_BASE: base },
    });
  const linted = () => {
    try {
      return readFileSync(log, 'utf8');
    } catch {
      return '';
    }
  };
  return { root, run, linted };
}

test('Squawk lints only the migration folders this change adds', () => {
  const { run, linted } = scoped();
  const r = run('target');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = linted();
  assert.match(out, /20260301000000_added_by_the_pr\/migration\.sql/);
  assert.doesNotMatch(out, /already_on_main/);
  assert.doesNotMatch(out, /other_prs_migration/);
});

test('on a push, only the migrations that push added are linted', () => {
  const { root, run, linted } = scoped();
  const before = spawnSync('git', ['rev-parse', 'HEAD^1'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const r = run(before);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = linted();
  assert.match(out, /20260215000000_other_prs_migration\/migration\.sql/);
  assert.doesNotMatch(out, /added_by_the_pr|already_on_main/);
});

test('a push with no previous commit lints nothing', () => {
  const { run, linted } = scoped();
  const r = run('0000000000000000000000000000000000000000');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(linted(), '');
});

test('an unresolvable target branch fails instead of silently skipping', () => {
  const { run } = scoped();
  assert.equal(run('origin/nonexistent').status, 1);
});
