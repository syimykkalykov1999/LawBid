// Prisma 7: the generated client is TypeScript (src/generated/prisma), so the
// plain-Node migrate scripts (run-concurrent, migrate-shards,
// ensure-partition-login, scripts/migrate-from-previous) cannot import it any
// more. They only ever ran raw SQL, so they use node-pg (the driver under
// Prisma 7's PrismaPg adapter) directly: ONE connection (what
// run-concurrent's `connection_limit=1` gave: its SET lock_timeout must hold
// for the statements after it) with the three calls they used.
//
// TLS keeps the Prisma 6 behaviour, exactly as src/prisma/pg-adapter.ts:
// `sslmode=disable`, or none on a local host → no TLS; none on a remote
// host → TLS without certificate check; any other sslmode → TLS without
// certificate check; `sslaccept=strict` → certificate and host checked, CA
// from `sslcert`. pg-adapter.spec.ts checks both stay the same.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import pg from 'pg';

const PRISMA_ONLY = [
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'socket_timeout',
  'max_connection_lifetime',
  'max_idle_connection_lifetime',
  'pgbouncer',
  'statement_cache_size',
  'schema',
  'sslmode',
  'sslaccept',
  'sslcert',
  'sslidentity',
  'sslpassword',
  'sslkey',
  'sslrootcert',
];

/** Same rule as isLocalHost in src/prisma/pg-adapter.ts. */
export function isLocalHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    h === '' ||
    h === 'localhost' ||
    h === '::1' ||
    h.startsWith('127.') ||
    h === 'host.docker.internal' ||
    !h.includes('.')
  );
}

/** node-pg client config for a Prisma 6 style URL (one connection). */
export function pgClientConfig(raw) {
  if (!raw) throw new Error('database URL is not set');
  const url = new URL(raw);
  const q = url.searchParams;
  const mode = q.get('sslmode')?.trim().toLowerCase();
  let ssl = false;
  if (!mode && !isLocalHost(url.hostname)) {
    // 14.11 (KE 146): a remote server without sslmode keeps Prisma 6
    // "prefer" — TLS, certificate not checked (RDS refuses clear text).
    ssl = { rejectUnauthorized: false };
  } else if (mode && mode !== 'disable') {
    if (q.get('sslaccept')?.trim().toLowerCase() === 'strict') {
      const cert = q.get('sslcert')?.trim();
      ssl = cert
        ? {
            rejectUnauthorized: true,
            ca: readFileSync(
              isAbsolute(cert) ? cert : resolve('prisma', cert),
              'utf8',
            ),
          }
        : { rejectUnauthorized: true };
    } else {
      ssl = { rejectUnauthorized: false };
    }
  }
  const timeout = Number(q.get('connect_timeout') ?? 5);
  for (const k of PRISMA_ONLY) q.delete(k);
  return {
    connectionString: url.toString(),
    ssl,
    connectionTimeoutMillis:
      Number.isFinite(timeout) && timeout > 0 ? timeout * 1000 : 0,
  };
}

/** `$queryRawUnsafe` / `$executeRawUnsafe` / `$disconnect` on one pg
 * connection (opened on the first call), as the scripts used them. */
export function rawClient(url) {
  const client = new pg.Client(pgClientConfig(url));
  let connected = null;
  const ready = () => (connected ??= client.connect());
  return {
    async $queryRawUnsafe(sql, ...params) {
      await ready();
      return (await client.query(sql, params)).rows;
    },
    async $executeRawUnsafe(sql, ...params) {
      await ready();
      return (await client.query(sql, params)).rowCount ?? 0;
    },
    async $disconnect() {
      if (connected) await client.end();
    },
  };
}
