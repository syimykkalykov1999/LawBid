import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgAdapter, pgAdapterConfig } from './pg-adapter';
import { withPoolerRouting } from './pooler-url';
import { withPoolDefaults } from './prisma.service';

const BASE = 'postgresql://app:p%40ss@db.example:5432/lawbid';

describe('pgAdapterConfig (Prisma 6 URL → node-pg, Prisma 7)', () => {
  it('pool: connection_limit → max, the larger of pool_timeout / connect_timeout → connectionTimeoutMillis, v6 idle 300 s', () => {
    const { pool } = pgAdapterConfig(
      `${BASE}?connection_limit=7&pool_timeout=10&connect_timeout=10`,
    );
    expect(pool.max).toBe(7);
    expect(pool.connectionTimeoutMillis).toBe(10_000);
    expect(pool.idleTimeoutMillis).toBe(300_000);
    expect(pool).not.toHaveProperty('maxLifetimeSeconds');
  });

  it('verify batch 13 (P1): TCP keepalive on; Prisma 6 socket_timeout → node-pg query_timeout', () => {
    const plain = pgAdapterConfig(BASE).pool;
    expect(plain.keepAlive).toBe(true);
    expect(plain.keepAliveInitialDelayMillis).toBe(10_000);
    expect(plain).not.toHaveProperty('query_timeout');
    const { pool } = pgAdapterConfig(`${BASE}?socket_timeout=45`);
    expect(pool.query_timeout).toBe(45_000);
    expect(pool.connectionString).not.toContain('socket_timeout');
  });

  it('pool: the app defaults (withPoolDefaults) keep their effective values', () => {
    const url = withPoolDefaults(BASE, { DB_POOL_SIZE: '12' });
    const { pool } = pgAdapterConfig(url!);
    expect(pool.max).toBe(12);
    expect(pool.connectionTimeoutMillis).toBe(10_000);
  });

  it('pool: without parameters the Prisma 6 defaults (CPUs × 2 + 1, 10 s / 5 s → 10 s)', () => {
    const { pool } = pgAdapterConfig(BASE);
    expect(pool.max).toBe(availableParallelism() * 2 + 1);
    expect(pool.connectionTimeoutMillis).toBe(10_000);
  });

  it('pool: 0 = no timeout, max_connection_lifetime → maxLifetimeSeconds', () => {
    const { pool } = pgAdapterConfig(
      `${BASE}?pool_timeout=0&max_connection_lifetime=600&max_idle_connection_lifetime=60`,
    );
    expect(pool.connectionTimeoutMillis).toBe(0);
    expect(pool.maxLifetimeSeconds).toBe(600);
    expect(pool.idleTimeoutMillis).toBe(60_000);
  });

  it('removes every Prisma-only and TLS parameter from the URL node-pg parses (the parsed URL would override `ssl`)', () => {
    const { pool, schema } = pgAdapterConfig(
      `${BASE}?sslmode=require&sslaccept=strict&schema=public&pgbouncer=true&connection_limit=3&application_name=api`,
    );
    const u = new URL(pool.connectionString!);
    expect([...u.searchParams.keys()]).toEqual(['application_name']);
    expect(u.password).toBe('p%40ss');
    expect(schema).toBe('public');
  });

  it.each([
    [
      'no sslmode, remote host (v6 prefer: encrypted, not checked)',
      '',
      { rejectUnauthorized: false },
    ],
    ['sslmode=disable', '?sslmode=disable', false],
    [
      'sslmode=disable wins over sslaccept=strict',
      '?sslmode=disable&sslaccept=strict',
      false,
    ],
    [
      'sslmode=require (v6: encrypted, certificate not checked)',
      '?sslmode=require',
      { rejectUnauthorized: false },
    ],
    [
      'sslmode=verify-full on a non-RDS host with no sslrootcert (review #1336: no CA = unchecked as before, never a broken connection)',
      '?sslmode=verify-full',
      { rejectUnauthorized: false },
    ],
    [
      'sslaccept=accept_invalid_certs',
      '?sslmode=require&sslaccept=accept_invalid_certs',
      { rejectUnauthorized: false },
    ],
    [
      'sslaccept=strict without a CA file',
      '?sslmode=require&sslaccept=strict',
      { rejectUnauthorized: true },
    ],
  ])('TLS: %s', async (_name, query, ssl) => {
    expect(pgAdapterConfig(`${BASE}${query}`).pool.ssl).toEqual(ssl);
    // The plain-Node migrate scripts use the same rule (prisma/pg-client.mjs).
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    expect(pgClientConfig(`${BASE}${query}`).ssl).toEqual(ssl);
  });

  it.each([
    'postgresql://u:p@localhost:5432/db',
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u:p@postgres:5432/db',
  ])('TLS: no sslmode on a local / compose host %s → plain', async (u) => {
    expect(pgAdapterConfig(u).pool.ssl).toBe(false);
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    expect(pgClientConfig(u).ssl).toBe(false);
  });

  it('TLS: no sslmode on an RDS / pooler host → encrypted (RDS force_ssl, 14.11)', () => {
    for (const h of [
      'lawbid-prod-postgres.abc.us-east-1.rds.amazonaws.com',
      'pgbouncer.lawbid-prod.internal',
    ])
      expect(pgAdapterConfig(`postgresql://u:p@${h}:5432/db`).pool.ssl).toEqual(
        { rejectUnauthorized: false },
      );
  });

  it('TLS: the pooler URL with its private CA → certificate and host checked against that CA', async () => {
    const pem =
      '-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----';
    const url = withPoolerRouting(`${BASE}?sslmode=verify-full`, {
      DB_POOLER_HOST: 'pooler.internal',
      DB_POOLER_CA_PEM: pem,
    });
    const { pool } = pgAdapterConfig(url!);
    expect(pool.ssl).toEqual({ rejectUnauthorized: true, ca: `${pem}\n` });
    expect(new URL(pool.connectionString!).hostname).toBe('pooler.internal');
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    expect(pgClientConfig(url!).ssl).toEqual(pool.ssl);
  });

  it('TLS: the pooler URL without a CA → encrypted, not checked (as Prisma 6)', () => {
    const url = withPoolerRouting(`${BASE}?sslmode=verify-full`, {
      DB_POOLER_HOST: 'pooler.internal',
    });
    expect(pgAdapterConfig(url!).pool.ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('TLS: a CA file given by path is read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-adapter-'));
    const file = join(dir, 'ca.pem');
    writeFileSync(file, 'CA');
    expect(
      pgAdapterConfig(
        `${BASE}?sslmode=require&sslaccept=strict&sslcert=${file}`,
      ).pool.ssl,
    ).toEqual({ rejectUnauthorized: true, ca: 'CA' });
  });

  it('pgAdapter: a PrismaPg adapter; no URL fails only on the first query (like Prisma 6)', () => {
    expect(pgAdapter(`${BASE}?schema=public`)).toBeInstanceOf(PrismaPg);
    expect(() => pgAdapter(undefined)).not.toThrow();
  });
});

/** ASVS 5.0 V12.3.2 / V12.3.4 (STAGE2_SECURITY #14): the API verifies the
 * database certificate when the URL says verify-full / verify-ca. */
describe('database TLS: verify-full / verify-ca', () => {
  const BASE_URL = 'postgresql://app:pw@db.x.rds.amazonaws.com:5432/lawbid';
  let dir: string;
  let ca: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pg-ca-'));
    ca = join(dir, 'rds-ca.pem');
    writeFileSync(ca, 'TEST-CA-PEM');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('verify-full + sslrootcert: certificate checked against that CA, host checked', async () => {
    const url = `${BASE_URL}?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
    const want = { rejectUnauthorized: true, ca: 'TEST-CA-PEM' };
    expect(pgAdapterConfig(url).pool.ssl).toEqual(want);
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    expect(pgClientConfig(url).ssl).toEqual(want);
    // The TLS parameters never reach node-pg's own URL parser.
    expect(pgAdapterConfig(url).pool.connectionString).not.toMatch(/ssl/);
  });

  it('verify-ca: the chain is checked, the host name is not', async () => {
    const url = `${BASE_URL}?sslmode=verify-ca&sslrootcert=${encodeURIComponent(ca)}`;
    const ssl = pgAdapterConfig(url).pool.ssl as {
      rejectUnauthorized: boolean;
      ca: string;
      checkServerIdentity: () => undefined;
    };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe('TEST-CA-PEM');
    expect(ssl.checkServerIdentity()).toBeUndefined();
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    const c = pgClientConfig(url).ssl as typeof ssl;
    expect(c.rejectUnauthorized).toBe(true);
    expect(c.checkServerIdentity()).toBeUndefined();
  });

  it('review #1336: an RDS endpoint uses the baked bundle; no bundle or an alias keeps the old unchecked TLS', async () => {
    const bundle = join(dir, 'global-bundle.pem');
    writeFileSync(bundle, 'RDS-BUNDLE-PEM');
    const before = process.env.RDS_CA_BUNDLE_PATH;
    const { pgClientConfig } = await import('../../prisma/pg-client.mjs');
    try {
      process.env.RDS_CA_BUNDLE_PATH = bundle;
      const rds = `${BASE_URL}?sslmode=verify-full`;
      expect(pgAdapterConfig(rds).pool.ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'RDS-BUNDLE-PEM',
      });
      expect(pgClientConfig(rds).ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'RDS-BUNDLE-PEM',
      });
      // An alias in front of RDS cannot pass the host check: unchecked.
      const alias =
        'postgresql://app:pw@db.lawbid.internal:5432/lawbid?sslmode=verify-full';
      expect(pgAdapterConfig(alias).pool.ssl).toEqual({
        rejectUnauthorized: false,
      });
      expect(pgClientConfig(alias).ssl).toEqual({ rejectUnauthorized: false });
      // The owner's Mac (prod-db-setup.sh): no bundle file → unchecked.
      process.env.RDS_CA_BUNDLE_PATH = join(dir, 'missing.pem');
      expect(pgAdapterConfig(rds).pool.ssl).toEqual({
        rejectUnauthorized: false,
      });
      expect(pgClientConfig(rds).ssl).toEqual({ rejectUnauthorized: false });
    } finally {
      if (before === undefined) delete process.env.RDS_CA_BUNDLE_PATH;
      else process.env.RDS_CA_BUNDLE_PATH = before;
    }
  });

  it('sslmode=require stays encrypted-but-unchecked until the URL is switched (owner step)', () => {
    expect(pgAdapterConfig(`${BASE_URL}?sslmode=require`).pool.ssl).toEqual({
      rejectUnauthorized: false,
    });
  });
});
