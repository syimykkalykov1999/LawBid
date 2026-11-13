import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

/**
 * Prisma 7: every PrismaClient needs a driver adapter (official upgrade
 * guide, prisma.io/docs/guides/upgrade-prisma-orm/v7 → "Driver adapters").
 * Our database URLs keep their Prisma 6 shape (secrets, pooler routing,
 * pool defaults are built as URLs); this turns one into the node-pg pool
 * configuration with the SAME effective behaviour.
 *
 * Pool (v7 connection-pool reference, "Prisma ORM v7 driver adapter
 * defaults", table for `pg`):
 *   connection_limit              → max (v6 default physical CPUs × 2 + 1)
 *   pool_timeout / connect_timeout → connectionTimeoutMillis (node-pg has one
 *                                    knob for both: the larger of the two,
 *                                    v6 defaults 10 s / 5 s; 0 = no timeout)
 *   max_idle_connection_lifetime  → idleTimeoutMillis (v6 default 300 s)
 *   max_connection_lifetime       → maxLifetimeSeconds (v6 default 0 = none)
 *   schema                        → the adapter's `schema` option
 *   pgbouncer                     → dropped: the pg adapter sends unnamed
 *                                    statements unless a statementNameGenerator
 *                                    is given, which is what pgbouncer=true did.
 *
 * TLS (guide, "SSL certificate validation changes"): Prisma 6 encrypted
 * with any `sslmode` except `disable` and did NOT check the certificate
 * unless `sslaccept=strict` (its default was `accept_invalid_certs`; unknown
 * modes such as verify-full fell back to `prefer`). node-pg would verify for
 * `require`/`verify-*`, so the RDS and pooler connections would fail. Here:
 *   sslmode=disable                → no TLS
 *   no sslmode                     → no TLS (node-pg cannot "prefer"; staging
 *                                    and production URLs must carry sslmode,
 *                                    env.schema.ts enforces it)
 *   any other sslmode              → TLS, certificate not checked
 *   … + sslaccept=strict           → TLS, certificate and host name checked;
 *                                    `sslcert` = the CA file (Prisma resolved a
 *                                    relative path from prisma/)
 * The TLS parameters are removed from the URL handed to node-pg, because
 * the parsed URL would override the `ssl` object.
 */
export interface PgAdapterConfig {
  pool: PoolConfig;
  schema?: string;
}

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

function seconds(v: string | null, fallback: number): number {
  if (v === null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function pgAdapterConfig(raw: string): PgAdapterConfig {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a URL we can read: hand it to node-pg as it is.
    return { pool: { connectionString: raw } };
  }
  const q = url.searchParams;
  const limit = Number(q.get('connection_limit'));
  const max =
    Number.isInteger(limit) && limit > 0
      ? limit
      : availableParallelism() * 2 + 1;
  const poolTimeout = seconds(q.get('pool_timeout'), 10);
  const connectTimeout = seconds(q.get('connect_timeout'), 5);
  const connectionTimeoutMillis =
    poolTimeout === 0 || connectTimeout === 0
      ? 0
      : Math.max(poolTimeout, connectTimeout) * 1000;
  const idleTimeoutMillis =
    seconds(q.get('max_idle_connection_lifetime'), 300) * 1000;
  const maxLifetimeSeconds = seconds(q.get('max_connection_lifetime'), 0);

  const mode = q.get('sslmode')?.trim().toLowerCase();
  let ssl: PoolConfig['ssl'] = false;
  if (mode && mode !== 'disable') {
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
  const schema = q.get('schema')?.trim() || undefined;
  for (const k of PRISMA_ONLY) q.delete(k);
  return {
    pool: {
      connectionString: url.toString(),
      max,
      connectionTimeoutMillis,
      idleTimeoutMillis,
      ...(maxLifetimeSeconds > 0 ? { maxLifetimeSeconds } : {}),
      ssl,
    },
    ...(schema ? { schema } : {}),
  };
}

/**
 * The driver adapter for one database URL (Prisma 6 URL shape). Like
 * Prisma 6, a missing URL fails on the first query, not here: the pool is
 * only opened by `$connect()` / the first query.
 */
export function pgAdapter(url: string | undefined): PrismaPg {
  if (!url) return new PrismaPg({});
  const { pool, schema } = pgAdapterConfig(url);
  return new PrismaPg(pool, schema ? { schema } : undefined);
}
