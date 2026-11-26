// node --test scripts/ensure-migrator-role.test.mjs
// D8 (26.11): migrations run as lawbid_migrator; the migrate task makes the
// role ready as the master user and prints the URL the schema steps use
// (prisma/ensure-migrator-role.mjs, prisma/migrator-role.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureMigratorRole,
  generatorQueries,
  migratorUrl,
  plan,
  problems,
  SQL_FILE,
} from '../prisma/ensure-migrator-role.mjs';

const MASTER = 'postgresql://lawbid_admin:master-test-pw@db.example.test:5432/lawbid?sslmode=require';
const SQL = readFileSync(SQL_FILE, 'utf8');
const READY = {
  role: { rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false },
  memberOfMaster: false,
  memberOfRdsSuperuser: false,
  ownsDatabase: false,
  canCreateInPublic: true,
  leftWithMaster: 0,
};

function fakeDb({ user = 'lawbid_admin', hasTable = true, state = READY, failStmt = null, lockOnce = false } = {}) {
  const calls = [];
  let locked = lockOnce;
  return {
    calls,
    async $queryRawUnsafe(sql, ...p) {
      calls.push({ kind: 'query', sql, p });
      if (/current_user, to_regclass/.test(sql)) return [{ current_user: user, has_table: hasTable }];
      if (/format\('ALTER ROLE lawbid_migrator WITH LOGIN PASSWORD %L'/.test(sql)) {
        return [{ stmt: `ALTER ROLE lawbid_migrator WITH LOGIN PASSWORD '${p[0]}'` }];
      }
      if (/"leftWithMaster"/.test(sql)) return [state];
      if (/ALTER %s %I\.%I OWNER/.test(sql) && /n\.oid = c\.relnamespace/.test(sql)) return [{ stmt: 'ALTER TABLE public.users OWNER TO lawbid_migrator' }];
      return [];
    },
    async $executeRawUnsafe(sql) {
      calls.push({ kind: 'exec', sql });
      if (failStmt && sql.includes(failStmt)) throw Object.assign(new Error('denied'), { code: '42501' });
      if (locked && /OWNER TO/.test(sql)) {
        locked = false;
        throw Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
      }
      return 0;
    },
  };
}

const okLogin = (who = 'lawbid_migrator') => () => ({
  async $queryRawUnsafe() { return [{ who }]; },
  async $disconnect() {},
});

test('plan: off without a password, nothing to do as the migrator, master on a new database', () => {
  assert.equal(plan({ password: '', currentUser: 'lawbid_admin', hasMigrationsTable: true }), 'off');
  assert.equal(plan({ password: ' ', currentUser: 'lawbid_admin', hasMigrationsTable: true }), 'off');
  assert.equal(plan({ password: 'p', currentUser: 'lawbid_migrator', hasMigrationsTable: true }), 'already_migrator');
  assert.equal(plan({ password: 'p', currentUser: 'lawbid_admin', hasMigrationsTable: false }), 'first_install');
  assert.equal(plan({ password: 'p', currentUser: 'lawbid_admin', hasMigrationsTable: true }), 'bootstrap');
});

test('problems: every unsafe attribute keeps the master user on', () => {
  assert.deepEqual(problems(READY), []);
  assert.deepEqual(problems({ ...READY, role: null }), ['role lawbid_migrator does not exist']);
  for (const k of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
    assert.equal(problems({ ...READY, role: { ...READY.role, [k]: true } }).length, 1, k);
  }
  assert.equal(problems({ ...READY, memberOfMaster: true }).length, 1);
  assert.equal(problems({ ...READY, memberOfRdsSuperuser: true }).length, 1);
  assert.equal(problems({ ...READY, ownsDatabase: true }).length, 1);
  assert.equal(problems({ ...READY, leftWithMaster: 3 }).length, 1);
  assert.equal(problems({ ...READY, canCreateInPublic: false }).length, 1);
});

test('migratorUrl keeps host, database and options, swaps only the login', () => {
  const u = new URL(migratorUrl(MASTER, 'p@ss/w:rd'));
  assert.equal(u.username, 'lawbid_migrator');
  assert.equal(decodeURIComponent(u.password), 'p@ss/w:rd');
  assert.equal(u.host, 'db.example.test:5432');
  assert.equal(u.pathname, '/lawbid');
  assert.equal(u.searchParams.get('sslmode'), 'require');
});

test('migrator-role.sql: psql \\gexec generators only, no password, no REASSIGN OWNED, no role powers', () => {
  const qs = generatorQueries(SQL);
  assert.ok(qs.length >= 12, `${qs.length} generators`);
  for (const q of qs) assert.match(q, /^SELECT /, q.slice(0, 60));
  for (const q of qs) assert.doesNotMatch(q, /REASSIGN OWNED|DROP /i);
  assert.doesNotMatch(SQL, /PASSWORD\s+'/i);
  assert.match(SQL, /CREATE ROLE lawbid_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.doesNotMatch(SQL, /GRANT rds_superuser|\bWITH (SUPERUSER|CREATEDB|CREATEROLE)\b/);
  assert.match(SQL, /ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lawbid_app/);
  assert.match(SQL, /GRANT lawbid_migrator TO %I WITH INHERIT TRUE, SET TRUE/);
});

test('off: no password -> the master URL unchanged, nothing executed', async () => {
  const db = fakeDb();
  const r = await ensureMigratorRole({ prisma: db, url: MASTER, password: undefined, connect: okLogin(), sql: SQL, log: () => {} });
  assert.equal(r.url, MASTER);
  assert.equal(r.step, 'off');
  assert.equal(db.calls.filter((c) => c.kind === 'exec').length, 0);
});

test('first install: the master user runs the first migrations', async () => {
  const db = fakeDb({ hasTable: false });
  const r = await ensureMigratorRole({ prisma: db, url: MASTER, password: 'migrator-test-pw', connect: okLogin(), sql: SQL, log: () => {} });
  assert.equal(r.url, MASTER);
  assert.equal(r.step, 'first_install');
  assert.equal(db.calls.filter((c) => c.kind === 'exec').length, 0);
});

test('ready: runs the generated statements, sets the password bound, returns the migrator URL', async () => {
  const db = fakeDb({ lockOnce: true });
  const logs = [];
  const r = await ensureMigratorRole({ prisma: db, url: MASTER, password: 'migrator-test-pw', connect: okLogin(), sql: SQL, log: (m) => logs.push(m) });
  assert.equal(r.step, 'migrator');
  assert.equal(new URL(r.url).username, 'lawbid_migrator');
  const owner = db.calls.filter((c) => c.kind === 'exec' && /OWNER TO lawbid_migrator/.test(c.sql));
  assert.equal(owner.length, 2, 'one lock timeout, retried once');
  const fmt = db.calls.find((c) => /%L/.test(c.sql));
  assert.deepEqual(fmt.p, ['migrator-test-pw']);
  assert.ok(!fmt.sql.includes('migrator-test-pw'), 'password never part of the SQL text');
  assert.ok(logs.every((l) => !l.includes('migrator-test-pw')), 'password never logged');
});

test('not ready (objects left, or login fails): FALLBACK to the master URL, the deploy goes on', async () => {
  const logs = [];
  const a = await ensureMigratorRole({
    prisma: fakeDb({ state: { ...READY, leftWithMaster: 2 } }), url: MASTER, password: 'migrator-test-pw',
    connect: okLogin(), sql: SQL, log: (m) => logs.push(m),
  });
  assert.equal(a.url, MASTER);
  assert.equal(a.step, 'fallback');
  assert.ok(logs.some((l) => /FALLBACK to lawbid_admin/.test(l)));
  const b = await ensureMigratorRole({
    prisma: fakeDb(), url: MASTER, password: 'migrator-test-pw',
    connect: () => ({ async $queryRawUnsafe() { throw Object.assign(new Error('auth'), { code: '28P01' }); }, async $disconnect() {} }),
    sql: SQL, log: () => {},
  });
  assert.equal(b.url, MASTER);
  assert.equal(b.step, 'fallback');
  const c = await ensureMigratorRole({ prisma: fakeDb(), url: MASTER, password: 'migrator-test-pw', connect: okLogin('lawbid_admin'), sql: SQL, log: () => {} });
  assert.equal(c.step, 'fallback');
});

test('a refused step is logged and counted, the check decides', async () => {
  const logs = [];
  const r = await ensureMigratorRole({
    prisma: fakeDb({ failStmt: 'OWNER TO' }), url: MASTER, password: 'migrator-test-pw',
    connect: okLogin(), sql: SQL, log: (m) => logs.push(m),
  });
  assert.ok(logs.some((l) => /step failed \(42501\)/.test(l)));
  assert.equal(r.step, 'migrator', 'the fake state says nothing is left');
});
