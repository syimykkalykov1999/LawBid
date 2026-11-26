#!/usr/bin/env node
// D8 (26.11): CI proof on the migrated database that lawbid_migrator can do
// what migrations need and nothing more (api-ci «Migrations run as the narrow
// role lawbid_migrator»). Run with DATABASE_URL = the URL printed by
// prisma/ensure-migrator-role.mjs.
//   - it is lawbid_migrator, not a superuser, not CREATEDB / CREATEROLE;
//   - it does not own the database (cannot drop it);
//   - a new table gets lawbid_app's DML and sequence rights by itself
//     (ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator), inside a rolled-back
//     transaction;
//   - CREATE ROLE and reading pg_authid are refused (42501).
// Exit 1 with the first broken rule.
import { rawClient } from '../prisma/pg-client.mjs';

const db = rawClient(process.env.DATABASE_URL);
const fail = (m) => {
  console.error(`::error title=lawbid_migrator rights::${m}`);
  process.exitCode = 1;
};
async function refused(sql) {
  try {
    await db.$executeRawUnsafe('SAVEPOINT probe');
    await db.$executeRawUnsafe(sql);
    return false;
  } catch (e) {
    await db.$executeRawUnsafe('ROLLBACK TO SAVEPOINT probe');
    return e?.code === '42501';
  }
}

try {
  const [me] = await db.$queryRawUnsafe(`
    SELECT current_user AS who, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
           (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS db_owner
      FROM pg_roles r WHERE r.rolname = current_user`);
  if (me.who !== 'lawbid_migrator') fail(`connected as ${me.who}`);
  for (const k of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
    if (me[k]) fail(`${k} is true`);
  }
  if (me.db_owner === me.who) fail('owns the database');

  await db.$executeRawUnsafe('BEGIN');
  await db.$executeRawUnsafe('CREATE TABLE d8_migrator_probe (id bigserial PRIMARY KEY, v text)');
  const [g] = await db.$queryRawUnsafe(`
    SELECT has_table_privilege('lawbid_app', 'd8_migrator_probe', 'SELECT,INSERT,UPDATE,DELETE') AS dml,
           has_sequence_privilege('lawbid_app', 'd8_migrator_probe_id_seq', 'USAGE') AS seq`);
  if (!g.dml) fail('a new table does not give lawbid_app SELECT/INSERT/UPDATE/DELETE');
  if (!g.seq) fail('a new sequence does not give lawbid_app USAGE');
  if (!(await refused('CREATE ROLE d8_probe_role'))) fail('CREATE ROLE was not refused');
  if (!(await refused('SELECT 1 FROM pg_authid'))) fail('pg_authid was readable');
  await db.$executeRawUnsafe('ROLLBACK');
  if (!process.exitCode) console.log('lawbid_migrator: DDL on the schema, rights for lawbid_app, no role or database powers');
} finally {
  await db.$disconnect();
}
