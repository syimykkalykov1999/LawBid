// node --test scripts/check-migrations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = join(import.meta.dirname, 'check-migrations.mjs');

function run(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  mkdirSync(join(dir, '20260101000000_base'));
  mkdirSync(join(dir, '20270101000000_sample'));
  writeFileSync(join(dir, '20270101000000_sample', 'migration.sql'), sql);
  return spawnSync('node', [script, dir, '20260101000000_base'], { encoding: 'utf8' });
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
