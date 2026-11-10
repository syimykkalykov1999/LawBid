import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './migration-role-check.mjs';

const docs = (lines) => new Map([['docs/x.md', lines.join('\n')]]);
const reader = (m) => (f) => m.get(f) ?? null;

test('a doc naming the truth role passes', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs(['Миграции идут под `lawbid_admin` (секрет MIGRATOR_DATABASE_URL).'])));
  assert.deepEqual(p, []);
});

test('a doc naming the other role as the migration user fails with file:line', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs(['intro', '| `lawbid_migrator` | DDL, только в CI/CD при деплое (миграции) |'])));
  assert.equal(p.length, 1);
  assert.match(p[0], /^docs\/x\.md:2: names lawbid_migrator/);
});

test('the other role is allowed when the line says it is planned / not in use, or names the truth too', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs([
    'Роль `lawbid_migrator` (план, миграции пока идут не под ней)',
    'prisma migrate deploy runs as lawbid_admin, not lawbid_migrator',
  ])));
  assert.deepEqual(p, []);
});

test('a role mentioned outside the migration context is ignored', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs(['GRANT lawbid_migrator TO lawbid_partition;', 'миграция 20261101 ставит таймауты роли lawbid_migrator'])));
  // second line: migration context + other role without marker → reported
  assert.equal(p.length, 1);
});

test('no mention anywhere is itself a failure (the check must not be blind)', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs(['nothing here'])));
  assert.equal(p.length, 1);
});

test('the real repository documents agree with infra/postgres/migration-role.txt', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../..', import.meta.url).pathname;
  const truth = readFileSync(join(root, 'infra/postgres/migration-role.txt'), 'utf8').trim();
  const { FILES } = await import('./migration-role-check.mjs');
  const p = check(FILES, truth, (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null));
  assert.deepEqual(p, []);
});
