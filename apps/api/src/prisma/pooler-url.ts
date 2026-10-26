import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Own PgBouncer in front of the database (docs/architecture/DB_POOLER.md).
 *
 * When `DB_POOLER_HOST` is set (infra: `db_pooler_enabled = true`), the
 * request-serving client (DATABASE_URL) talks to the pooler instead of the
 * database: the same user, password and database name, but the pooler's
 * host and port. The secret itself is NOT changed, so switching the pooler
 * off again (unset DB_POOLER_HOST) is the whole rollback.
 *
 * Only the main client is routed. DDL / retention / demo URLs and the
 * migrate task keep the direct endpoint on purpose: transaction pooling is
 * wrong for them (CREATE DATABASE, session state, `prisma migrate`).
 *
 * The pooler speaks TLS with its own self-signed certificate (the traffic
 * never leaves the VPC and only the API / worker security group may reach
 * it), so the URL is switched to `sslmode=require` + `sslaccept=
 * accept_invalid_certs` (encrypted, certificate not chained to a public CA).
 * Security pass 2026-10-25 (S3-7): when `DB_POOLER_CA_PEM` holds the PUBLIC
 * certificate of the private CA that signed the pooler's certificate
 * (infra: `pgbouncer_client_tls_private_ca = true`), the certificate is
 * written to a file and the URL becomes `sslmode=require&sslaccept=strict&
 * sslcert=<file>`, so a host that is not the pooler cannot answer.
 * `DB_POOLER_QUERY` adds extra parameters, e.g. `pgbouncer=true` to switch
 * Prisma's prepared statements off if the pooler is older than 1.21.
 */
export function withPoolerRouting(
  raw: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!raw) return raw;
  const host = env.DB_POOLER_HOST?.trim();
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
  const caFile = writePoolerCa(env.DB_POOLER_CA_PEM);
  if (caFile) {
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', caFile);
  } else {
    url.searchParams.set('sslaccept', 'accept_invalid_certs');
  }
  const extra = new URLSearchParams(env.DB_POOLER_QUERY?.trim() || '');
  for (const [k, v] of extra) url.searchParams.set(k, v);
  return url.toString();
}

/** Writes the pooler CA (a public certificate) once per content; null when
 * none is configured or the file cannot be written (then the connection
 * falls back to encrypted-but-unverified, with a warning). */
function writePoolerCa(pem: string | undefined): string | null {
  const text = pem?.trim();
  if (!text || !text.includes('BEGIN CERTIFICATE')) return null;
  const file = join(
    tmpdir(),
    `lawbid-pooler-ca-${createHash('sha256').update(text).digest('hex').slice(0, 12)}.pem`,
  );
  try {
    if (!existsSync(file)) writeFileSync(file, `${text}\n`, { mode: 0o644 });
    return file;
  } catch (e) {
    process.stderr.write(
      `pooler-url: cannot write the pooler CA (${(e as Error).message}); the pooler certificate is NOT verified\n`,
    );
    return null;
  }
}
