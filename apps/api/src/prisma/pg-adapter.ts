import { existsSync, readFileSync } from 'node:fs';
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
 *   sslmode=verify-full            → TLS, certificate AND host name checked
 *                                    (ASVS 5.0 V12.3.2, STAGE2_SECURITY #14);
 *                                    CA = `sslrootcert`, else the RDS global
 *                                    bundle baked into the image
 *                                    (RDS_CA_BUNDLE) for an RDS endpoint;
 *                                    no CA = unchecked as before + a warning
 *                                    (verifyCa)
 *   sslmode=verify-ca              → the same, without the host name check
 *                                    (libpq semantics)
 *   any other sslmode              → TLS, certificate not checked
 *   … + sslaccept=strict           → TLS, certificate and host name checked;
 *                                    `sslcert` = the CA file (Prisma resolved a
 *                                    relative path from prisma/)
 * The TLS parameters are removed from the URL handed to node-pg, because
 * the parsed URL would override the `ssl` object.
 */
/** The RDS global CA bundle apps/api/Dockerfile bakes in (pinned SHA-256,
 * the same file infra/pgbouncer/Dockerfile ships). */
export const RDS_CA_BUNDLE = '/etc/ssl/rds-global-bundle.pem';

/** RDS endpoints: the only hosts the baked RDS bundle can vouch for. */
export const RDS_HOST = /\.rds\.amazonaws\.com$/i;

/**
 * Review of #1336 (prod safety): the CA for sslmode=verify-*, or null when
 * this connection cannot be verified safely:
 *  - `sslrootcert` given → that file (an explicit CA, any host);
 *  - an RDS endpoint (*.rds.amazonaws.com) and the baked bundle present
 *    (the API / worker / migrate image) → the bundle;
 *  - anything else (an alias or internal name, a non-RDS provider, or the
 *    owner's Mac running scripts/deploy/prod-db-setup.sh without the
 *    bundle) → null: the connection keeps the behaviour it had before
 *    #1336 (TLS, certificate not checked) and one warning is written.
 * prod-db-setup.sh writes `sslmode=verify-full` into every connection
 * secret; before #1336 that mode was not checked at all, so turning the
 * check on for a host it cannot pass would take the database away at the
 * next deploy (docs/runbooks/DB_POOLER.md §8 has the same RDS-host rule).
 */
export function verifyCa(
  rootCert: string | undefined,
  host: string,
  bundle: string = process.env.RDS_CA_BUNDLE_PATH?.trim() || RDS_CA_BUNDLE,
): string | null {
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

const warned = new Set<string>();
function warnUnverified(host: string): void {
  if (warned.has(host)) return;
  warned.add(host);
  process.stderr.write(
    `database TLS: sslmode=verify-* for ${host} but no CA to check it with (not an RDS endpoint with the baked bundle, no sslrootcert); the certificate is NOT checked, as before #1336. Add sslrootcert or use the *.rds.amazonaws.com endpoint.\n`,
  );
}

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
  // Verify batch 13 (P1): Prisma 6's `socket_timeout` (seconds) was dropped
  // in silence; node-pg's client-side `query_timeout` is the same guard.
  const socketTimeout = seconds(q.get('socket_timeout'), 0);

  const mode = q.get('sslmode')?.trim().toLowerCase();
  let ssl: PoolConfig['ssl'] = false;
  if (!mode && !isLocalHost(url.hostname)) {
    // 14.11 (KE 146): Prisma 6 "prefer" encrypted a remote server without
    // sslmode; node-pg would connect in clear and RDS (rds.force_ssl = 1 by
    // default on PostgreSQL 16) would refuse it. A remote host without
    // sslmode keeps Prisma 6's behaviour: TLS, certificate not checked.
    ssl = { rejectUnauthorized: false };
  } else if (mode === 'verify-full' || mode === 'verify-ca') {
    const ca = verifyCa(
      q.get('sslrootcert')?.trim() || undefined,
      url.hostname,
    );
    if (ca === null) {
      warnUnverified(url.hostname);
      ssl = { rejectUnauthorized: false };
    } else {
      ssl = {
        rejectUnauthorized: true,
        ca,
        // verify-ca: the chain is checked, the host name is not (libpq).
        ...(mode === 'verify-ca'
          ? { checkServerIdentity: () => undefined }
          : {}),
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
  const schema = q.get('schema')?.trim() || undefined;
  for (const k of PRISMA_ONLY) q.delete(k);
  return {
    pool: {
      connectionString: url.toString(),
      max,
      connectionTimeoutMillis,
      idleTimeoutMillis,
      ...(maxLifetimeSeconds > 0 ? { maxLifetimeSeconds } : {}),
      ...(socketTimeout > 0 ? { query_timeout: socketTimeout * 1000 } : {}),
      // Verify batch 13 (P1): TCP keepalive on every pooled connection
      // (node-pg's default is off). Without it a connection to a database
      // host that vanished without a reset (failover, a dropped NAT / NLB
      // entry) hangs until the kernel gives up, ~15 min, and an idle pooled
      // socket the network forgot is only found on the next query. The
      // node-postgres option, as recommended for cloud databases.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
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
  $queryRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
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
    Array.from({ length: n }, () => client.$queryRaw`SELECT 1`),
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
