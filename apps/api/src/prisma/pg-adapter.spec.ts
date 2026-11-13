import { mkdtempSync, writeFileSync } from 'node:fs';
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
    ['no sslmode', '', false],
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
      'sslmode=verify-full (v6: unknown mode = prefer, not checked)',
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
