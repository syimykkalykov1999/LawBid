import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, truthOf } from './migration-role-check.mjs';

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

test('the other role is allowed only when the line names the switch, or names the truth too', () => {
  const p = check(['docs/x.md'], 'lawbid_admin', reader(docs([
    'Миграции идут под `lawbid_migrator`, когда включён переключатель aws.db_migrator_role',
    'prisma migrate deploy runs as lawbid_admin, not lawbid_migrator',
  ])));
  assert.deepEqual(p, []);
});

test('«planned / not in use» no longer excuses a line (it turns false when the switch is on)', () => {
  const p = check(['docs/x.md'], 'lawbid_migrator', reader(docs([
    'Миграции идут под lawbid_admin (lawbid_x — план, не используется)',
  ])));
  assert.equal(p.length, 1);
});

test('the truth follows the admin switch in growth.auto.tfvars.json', () => {
  assert.equal(truthOf({}), 'lawbid_admin');
  assert.equal(truthOf({ db_migrator_role_enabled: false }), 'lawbid_admin');
  assert.equal(truthOf({ db_migrator_role_enabled: true }), 'lawbid_migrator');
  assert.equal(truthOf({ db_migrator_role_enabled: 'true' }), 'lawbid_admin');
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

for (const on of [false, true]) {
  test(`the real repository documents are true with the switch ${on ? 'on' : 'off'}`, async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../..', import.meta.url).pathname;
    const { FILES } = await import('./migration-role-check.mjs');
    const p = check(FILES, truthOf({ db_migrator_role_enabled: on }), (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null));
    assert.deepEqual(p, []);
  });
}
