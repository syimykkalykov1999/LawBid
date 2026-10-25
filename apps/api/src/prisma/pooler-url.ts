/**
 * Own PgBouncer in front of the database (docs/architecture/DB_POOLER.md).
 *
 * When `DB_POOLER_HOST` is set (infra: `db_pooler_enabled = true`), the
 * request-serving client (DATABASE_URL) talks to the pooler instead of the
 * database: the same user, password and database name, but the pooler's
 * host and port. The secret itself is NOT changed, so switching the pooler
 * off again (unset DB_POOLER_HOST) is the whole rollback.
 *
 * The READ REPLICA client (prisma-read.service.ts) is routed by its OWN
 * variable, `DB_REPLICA_POOLER_HOST`: the pooler above forwards every
 * connection to ITS database host (the primary), so pointing the replica at
 * `DB_POOLER_HOST` would silently send the "replica" reads to the primary.
 * Set it only to a second PgBouncer whose DATABASE_URL is the replica.
 *
 * Only the main client is routed. DDL / retention / demo URLs and the
 * migrate task keep the direct endpoint on purpose: transaction pooling is
 * wrong for them (CREATE DATABASE, session state, `prisma migrate`).
 *
 * The pooler speaks TLS with its own self-signed certificate (the traffic
 * never leaves the VPC and only the API / worker security group may reach
 * it), so the URL is switched to `sslmode=require` + `sslaccept=
 * accept_invalid_certs` (encrypted, certificate not chained to a public CA).
 * `DB_POOLER_QUERY` adds extra parameters, e.g. `pgbouncer=true` to switch
 * Prisma's prepared statements off if the pooler is older than 1.21.
 */
export function withPoolerRouting(
  raw: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  hostVar: 'DB_POOLER_HOST' | 'DB_REPLICA_POOLER_HOST' = 'DB_POOLER_HOST',
): string | undefined {
  if (!raw) return raw;
  const host = env[hostVar]?.trim();
  if (!host) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hostname = host;
  url.port = env.DB_POOLER_PORT?.trim() || '5432';
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'accept_invalid_certs');
  const extra = new URLSearchParams(env.DB_POOLER_QUERY?.trim() || '');
  for (const [k, v] of extra) url.searchParams.set(k, v);
  return url.toString();
}
