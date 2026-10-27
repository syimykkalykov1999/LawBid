// node --test scripts/online-ddl.test.mjs
// Online-DDL part of check-migrations.mjs: Squawk on new migrations and the
// prisma/concurrent folder rules. Needs the squawk binary (SQUAWK_BIN or on
// PATH); CI installs it. Without it the tests are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = join(import.meta.dirname, 'check-migrations.mjs');
const squawk = process.env.SQUAWK_BIN || 'squawk';
const haveSquawk = !spawnSync(squawk, ['--version']).error;
const t = (name, fn) => test(name, { skip: !haveSquawk && 'squawk not installed' }, fn);

const LT = "SET LOCAL lock_timeout = '5s';\n";

function run(sql, concurrent = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ddl-'));
  const migrations = join(root, 'migrations');
  mkdirSync(join(migrations, '20260101000000_base'), { recursive: true });
  mkdirSync(join(migrations, '20270101000000_sample'));
  writeFileSync(join(migrations, '20270101000000_sample', 'migration.sql'), sql);
  if (Object.keys(concurrent).length) {
    mkdirSync(join(root, 'concurrent'));
    for (const [f, body] of Object.entries(concurrent)) writeFileSync(join(root, 'concurrent', f), body);
  }
  return spawnSync('node', [script, migrations, '20260101000000_base', '20270101000000_sample'], {
    encoding: 'utf8',
    env: { ...process.env, SQUAWK_BIN: squawk },
  });
}

const bad = {
  'index without CONCURRENTLY on an existing table': LT + 'CREATE INDEX "i" ON "a"("b");',
  'foreign key without NOT VALID': LT + 'ALTER TABLE "a" ADD CONSTRAINT "f" FOREIGN KEY ("b") REFERENCES "c"("id");',
  'check without NOT VALID': LT + 'ALTER TABLE "a" ADD CONSTRAINT "ck" CHECK ("b" > 0);',
  'NOT VALID and VALIDATE in the same migration':
    LT + 'ALTER TABLE "a" ADD CONSTRAINT "ck" CHECK ("b" > 0) NOT VALID;\nALTER TABLE "a" VALIDATE CONSTRAINT "ck";',
  'SET NOT NULL without a validated CHECK': LT + 'ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;',
  'column type change': LT + 'ALTER TABLE "a" ALTER COLUMN "b" TYPE BIGINT;',
  'volatile DEFAULT on ADD COLUMN': LT + 'ALTER TABLE "a" ADD COLUMN "u" UUID DEFAULT gen_random_uuid();',
  'no lock_timeout': 'ALTER TABLE "a" ADD COLUMN "n" TEXT;',
  'CONCURRENTLY inside a migration transaction': LT + 'CREATE INDEX CONCURRENTLY "i" ON "a"("b");\nSELECT 1;',
};
for (const [name, sql] of Object.entries(bad)) {
  t(`rejects ${name}`, () => {
    const r = run(sql);
    assert.equal(r.status, 1, r.stdout + r.stderr);
  });
}

t('allows the safe patterns', () => {
  const sql =
    LT +
    'ALTER TABLE "a" ADD COLUMN "n" TEXT;\n' +
    'ALTER TABLE "a" ADD COLUMN "v" INTEGER NOT NULL DEFAULT 0;\n' +
    'ALTER TABLE "a" ADD CONSTRAINT "ck" CHECK ("b" IS NOT NULL) NOT VALID;\n' +
    'ALTER TABLE "a" ADD CONSTRAINT "f" FOREIGN KEY ("b") REFERENCES "c"("id") NOT VALID;';
  const r = run(sql);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

t('SET NOT NULL is fine once the CHECK is validated (migration after the validate)', () => {
  const r = run(LT + 'ALTER TABLE "a" VALIDATE CONSTRAINT "ck";\nALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

t('a table created in the same migration may be indexed and constrained plainly', () => {
  const sql =
    LT +
    'CREATE TABLE "n" ("id" UUID PRIMARY KEY, "b" TEXT);\nCREATE INDEX "n_b" ON "n"("b");\n' +
    'ALTER TABLE "n" ADD CONSTRAINT "ck" CHECK ("b" <> \'\');';
  const r = run(sql);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

t('squawk-ignore with a reason lets a deliberate statement through', () => {
  const sql = LT + '-- admin_roles has 40 rows, a plain index builds in a millisecond\n-- squawk-ignore require-concurrent-index-creation\nCREATE INDEX "i" ON "a"("b");';
  const r = run(sql);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

t('prisma/concurrent: a valid file passes', () => {
  const r = run('SELECT 1;', {
    '20270101000001_a_b_idx.sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS a_b_idx ON a (b);',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /checked 1 concurrent file/);
});

for (const [name, files] of Object.entries({
  'a bad file name': { 'index.sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON a (b);' },
  'CREATE INDEX CONCURRENTLY without IF NOT EXISTS': { '20270101000001_x.sql': 'CREATE INDEX CONCURRENTLY i ON a (b);' },
  'a non-index statement': { '20270101000001_x.sql': 'ALTER TABLE a ADD COLUMN c TEXT;' },
  'a plain CREATE INDEX': { '20270101000001_x.sql': 'CREATE INDEX IF NOT EXISTS i ON a (b);' },
})) {
  t(`prisma/concurrent rejects ${name}`, () => {
    const r = run('SELECT 1;', files);
    assert.equal(r.status, 1, r.stdout + r.stderr);
  });
}
