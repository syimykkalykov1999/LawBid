// node --test scripts/ensure-partition-login.test.mjs
// Automation audit 2026-11-08: the migrate task gives lawbid_partition its
// login from PARTITION_DB_PASSWORD (prisma/ensure-partition-login.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensurePartitionLogin, plan } from '../prisma/ensure-partition-login.mjs';

function fakePrisma({ roleExists = true } = {}) {
  const calls = [];
  return {
    calls,
    async $queryRawUnsafe(sql, ...p) {
      calls.push({ kind: 'query', sql, p });
      if (/FROM pg_roles/.test(sql)) return roleExists ? [{ ok: 1 }] : [];
      if (/format\(/.test(sql)) return [{ stmt: `ALTER ROLE lawbid_partition WITH LOGIN PASSWORD '${p[0]}'` }];
      return [];
    },
    async $executeRawUnsafe(sql) {
      calls.push({ kind: 'exec', sql });
      return 0;
    },
  };
}

test('plan: no password, no role, or set', () => {
  assert.equal(plan({ password: '', roleExists: true }), 'skip_no_password');
  assert.equal(plan({ password: '  ', roleExists: true }), 'skip_no_password');
  assert.equal(plan({ password: undefined, roleExists: true }), 'skip_no_password');
  assert.equal(plan({ password: 'test-partition-password', roleExists: false }), 'skip_no_role');
  assert.equal(plan({ password: 'test-partition-password', roleExists: true }), 'set_password');
});

test('sets the password through format(%L) with a bound parameter', async () => {
  const prisma = fakePrisma();
  const logs = [];
  const r = await ensurePartitionLogin({ prisma, password: 'test-partition-password', log: (m) => logs.push(m) });
  assert.equal(r, 'set_password');
  const fmt = prisma.calls.find((c) => /format\(/.test(c.sql));
  assert.match(fmt.sql, /%L/);
  assert.deepEqual(fmt.p, ['test-partition-password']);
  assert.ok(!fmt.sql.includes('test-partition-password'), 'password is never part of the SQL text');
  assert.equal(prisma.calls.filter((c) => c.kind === 'exec').length, 1);
  assert.ok(logs.every((l) => !l.includes('test-partition-password')), 'password never logged');
});

test('does nothing without a password or without the role', async () => {
  const a = fakePrisma();
  assert.equal(await ensurePartitionLogin({ prisma: a, password: '', log: () => {} }), 'skip_no_password');
  assert.equal(a.calls.filter((c) => c.kind === 'exec').length, 0);
  const b = fakePrisma({ roleExists: false });
  assert.equal(await ensurePartitionLogin({ prisma: b, password: 'test-partition-password', log: () => {} }), 'skip_no_role');
  assert.equal(b.calls.filter((c) => c.kind === 'exec').length, 0);
});
