import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loginOf,
  roleSettingStatements,
  shardMigratorUrl,
  shardHosts,
  withHost,
} from '../prisma/migrate-shards.mjs';

test('shardHosts reads {"db1":"host"} and ignores bad input', () => {
  assert.deepEqual(shardHosts('{"db1":"a.rds","db2":"b.rds"}'), [
    ['db1', 'a.rds'],
    ['db2', 'b.rds'],
  ]);
  assert.deepEqual(shardHosts(''), []);
  assert.deepEqual(shardHosts('{nope'), []);
  assert.deepEqual(shardHosts('{"primary":"x","db1":""}'), []);
});

test('withHost swaps only host and port', () => {
  assert.equal(
    withHost(
      'postgresql://lawbid_admin:p%40ss@main.rds:5432/lawbid?sslmode=verify-full',
      'db1.rds',
    ),
    'postgresql://lawbid_admin:p%40ss@db1.rds:5432/lawbid?sslmode=verify-full',
  );
});

test('loginOf decodes role and password', () => {
  assert.deepEqual(loginOf('postgresql://lawbid_app:p%40ss@h/lawbid'), {
    role: 'lawbid_app',
    password: 'p@ss',
  });
  assert.equal(loginOf(''), null);
  assert.equal(loginOf('postgresql://h/lawbid'), null);
});

test('role settings: only ALTER ROLE ... SET, the copy equals infra/postgres', () => {
  const sql = readFileSync(
    new URL('../prisma/role-settings.sql', import.meta.url),
    'utf8',
  );
  const infra = readFileSync(
    new URL('../../../infra/postgres/role-settings.sql', import.meta.url),
    'utf8',
  );
  assert.equal(
    sql,
    infra,
    'apps/api/prisma/role-settings.sql must equal infra/postgres/role-settings.sql',
  );
  const s = roleSettingStatements(sql);
  assert.ok(s.length >= 8);
  for (const x of s) assert.match(x, /^ALTER ROLE [a-z_]+ SET /);
});

test('shardMigratorUrl: the master secret of the server, options of the primary URL', () => {
  const base =
    'postgresql://lawbid_admin:main@main.rds:5432/lawbid?sslmode=verify-full';
  const env = {
    DB_SHARD_MASTER_DB1: JSON.stringify({
      username: 'lawbid_admin',
      password: 'p@ss/1',
      host: 'db1.rds',
      port: 5432,
      dbname: 'lawbid',
    }),
  };
  assert.equal(
    shardMigratorUrl('db1', 'db1.rds', base, env),
    'postgresql://lawbid_admin:p%40ss%2F1@db1.rds:5432/lawbid?sslmode=verify-full',
  );
  assert.equal(
    shardMigratorUrl('db2', 'db2.rds', base, env),
    'postgresql://lawbid_admin:main@db2.rds:5432/lawbid?sslmode=verify-full',
  );
});
