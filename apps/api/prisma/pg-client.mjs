// Prisma 7: the generated client is TypeScript (src/generated/prisma), so the
// plain-Node migrate scripts (run-concurrent, migrate-shards,
// ensure-partition-login, scripts/migrate-from-previous) cannot import it any
// more. They only ever ran raw SQL, so they use node-pg (the driver under
// Prisma 7's PrismaPg adapter) directly: ONE connection (what
// run-concurrent's `connection_limit=1` gave: its SET lock_timeout must hold
// for the statements after it) with the three calls they used.
//
// TLS exactly as src/prisma/pg-adapter.ts:
// `sslmode=disable`, or none on a local host → no TLS; none on a remote
// host → TLS without certificate check; `sslmode=verify-full` → certificate
// and host checked, CA from `sslrootcert` or (RDS endpoint only) the baked
// RDS bundle, no CA = unchecked as before + a warning (STAGE2_SECURITY #14); `verify-ca` → the same without the host check; any
// other sslmode → TLS without certificate check; `sslaccept=strict` →
// certificate and host checked, CA from `sslcert`. pg-adapter.spec.ts checks
// both stay the same.
import { existsSync, readFileSync } from 'node:fs';
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

/** Same file as RDS_CA_BUNDLE in src/prisma/pg-adapter.ts. */
export const RDS_CA_BUNDLE = '/etc/ssl/rds-global-bundle.pem';

/** Same rule as verifyCa in src/prisma/pg-adapter.ts (review of #1336):
 * an explicit sslrootcert, or the baked bundle for an RDS endpoint, else
 * null (TLS without the check, as before, plus one warning). */
export const RDS_HOST = /\.rds\.amazonaws\.com$/i;
export function verifyCa(
  rootCert,
  host,
  bundle = process.env.RDS_CA_BUNDLE_PATH?.trim() || RDS_CA_BUNDLE,
) {
  if (rootCert) {
    return readFileSync(
      isAbsolute(rootCert) ? rootCert : resolve('prisma', rootCert),
      'utf8',
    );
  }
  if (RDS_HOST.test(host) && existsSync(bundle)) {
    return readFileSync(bundle, 'utf8');
  }
  return null;
}

const warned = new Set();
function warnUnverified(host) {
  if (warned.has(host)) return;
  warned.add(host);
  process.stderr.write(
    `database TLS: sslmode=verify-* for ${host} but no CA to check it with (not an RDS endpoint with the baked bundle, no sslrootcert); the certificate is NOT checked, as before #1336.\n`,
  );
}

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
  } else if (mode === 'verify-full' || mode === 'verify-ca') {
    const ca = verifyCa(q.get('sslrootcert')?.trim() || undefined, url.hostname);
    if (ca === null) {
      warnUnverified(url.hostname);
      ssl = { rejectUnauthorized: false };
    } else {
      ssl = {
        rejectUnauthorized: true,
        ca,
        ...(mode === 'verify-ca' ? { checkServerIdentity: () => undefined } : {}),
      };
    }
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
