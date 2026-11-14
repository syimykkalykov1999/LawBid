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
 *   no sslmode, local host         → no TLS (localhost, 127.x, ::1, compose
 *                                    service names without a dot)
 *   no sslmode, remote host        → TLS, certificate not checked (Prisma 6
 *                                    "prefer"; RDS refuses clear connections)
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

/** A database on this machine or a compose/CI service name (no dot):
 * plain connection, as before. Anything else is a remote server. */
export function isLocalHost(host: string): boolean {
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
  if (!mode && !isLocalHost(url.hostname)) {
    // 14.11 (KE 146): Prisma 6 "prefer" encrypted a remote server without
    // sslmode; node-pg would connect in clear and RDS (rds.force_ssl = 1 by
    // default on PostgreSQL 16) would refuse it. A remote host without
    // sslmode keeps Prisma 6's behaviour: TLS, certificate not checked.
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

/** The node-pg pool size a database URL gives (`connection_limit`, else the
 * v6 default) — the same number {@link pgAdapterConfig} hands to node-pg. */
export function poolMaxOf(url: string | undefined): number {
  if (!url) return 0;
  return pgAdapterConfig(url).pool.max ?? 0;
}

/** What {@link warmPool} needs: a client that runs one raw statement. */
export interface RawQueryClient {
  $queryRawUnsafe(sql: string): Promise<unknown>;
}

/**
 * 14.11 (detective F7, owner row 158): with Prisma 7 the driver adapter
 * opens node-pg connections lazily (`new Pool()` connects nothing; Prisma 6's
 * engine connected on `$connect()`), so the first requests after every task
 * boot paid for N TLS connections at once on a busy 0.5 vCPU (prod 14.11:
 * `AppConfig.findUnique took 2610 / 3994 / 3727 ms`). This opens [size]
 * connections before the task serves traffic, by running [size] `SELECT 1`
 * at the same time — each one makes the pool create its own connection
 * (node-pg Pool, README "pool.connect": a new client is created while the
 * pool is below `max` and no idle client is free). They then stay idle in
 * the pool for `idleTimeoutMillis` (max_idle_connection_lifetime).
 *
 * Never throws: a database that is down at boot must not stop the task from
 * starting (readiness reports it, as before); the failure is only counted.
 */
export async function warmPool(
  client: RawQueryClient,
  size: number,
): Promise<{ opened: number; failed: number; ms: number }> {
  const t0 = Date.now();
  const n = Number.isInteger(size) && size > 0 ? size : 0;
  const results = await Promise.allSettled(
    Array.from({ length: n }, () => client.$queryRawUnsafe('SELECT 1')),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { opened: n - failed, failed, ms: Date.now() - t0 };
}

/** DB_POOL_WARM=off switches the boot warm-up off (on by default; off under
 * jest unless DB_POOL_WARM=on, so unit/e2e query counters are unchanged). */
export function poolWarmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DB_POOL_WARM?.trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return false;
  if (v === 'on' || v === '1' || v === 'true') return true;
  return !env.JEST_WORKER_ID && env.NODE_ENV !== 'test';
}
