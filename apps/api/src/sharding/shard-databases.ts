import { PRIMARY_DB } from './shard-router';

/**
 * Shard-ready step 3: the physical databases besides `primary`.
 *
 * `primary` is DATABASE_URL (it also holds the global family and shard_map).
 * Other physical databases come from the optional JSON env
 *   DATABASE_URL_SHARDS='{"db1":"postgresql://...","db2":"postgresql://..."}'
 * and are the values `shard_map.physical_db` may name. Not set = one
 * database, every shard on `primary`, behaviour exactly as before sharding.
 */
export class ShardDatabaseNotConfiguredError extends Error {
  constructor(readonly key: string) {
    super(
      `shard_map points at physical database "${key}" but DATABASE_URL_SHARDS has no such key`,
    );
    this.name = 'ShardDatabaseNotConfiguredError';
  }
}

const KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/i;

export function parseShardDatabaseUrls(
  raw: string | undefined,
  onError: (message: string) => void = () => undefined,
): Record<string, string> {
  const text = raw?.trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    onError('DATABASE_URL_SHARDS is not valid JSON; ignored');
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    onError('DATABASE_URL_SHARDS must be a JSON object; ignored');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, url] of Object.entries(parsed)) {
    if (key === PRIMARY_DB) {
      onError('DATABASE_URL_SHARDS must not name "primary" (use DATABASE_URL)');
    } else if (!KEY_RE.test(key) || typeof url !== 'string' || !url.trim()) {
      onError(`DATABASE_URL_SHARDS entry "${key}" is invalid; ignored`);
    } else {
      out[key] = url.trim();
    }
  }
  return out;
}

/**
 * Every physical database besides `primary`, from the environment:
 *  - `DATABASE_URL_SHARDS` - full URLs (above), and
 *  - `DB_SHARD_HOSTS='{"db1":"host"}'` - only hosts. Terraform sets it when
 *    the admin's «Второй сервер базы» switch creates the server: the URL is
 *    DATABASE_URL with that host and port 5432 (`DB_SHARD_PORT`), the same
 *    role, password and database (the server is created with the primary's
 *    master password and the migrate task gives the roles their passwords),
 *    so no secret is filled by hand — like the read replica
 *    (src/prisma/replica-url.ts). A full URL wins for its key.
 */
export function shardDatabaseUrlsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  onError: (message: string) => void = () => undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const hosts = parseShardDatabaseUrls(env.DB_SHARD_HOSTS, (m) =>
    onError(m.replace(/DATABASE_URL_SHARDS/g, 'DB_SHARD_HOSTS')),
  );
  const base = env.DATABASE_URL?.trim();
  for (const [key, host] of Object.entries(hosts)) {
    if (!base) continue;
    try {
      const url = new URL(base);
      url.hostname = host;
      url.port = env.DB_SHARD_PORT?.trim() || '5432';
      out[key] = url.toString();
    } catch {
      onError(
        `DB_SHARD_HOSTS entry "${key}": DATABASE_URL is not a URL; ignored`,
      );
    }
  }
  return {
    ...out,
    ...parseShardDatabaseUrls(env.DATABASE_URL_SHARDS, onError),
  };
}

/**
 * Owner 2026-11-11: each extra database server may have its own read copy
 * (`DB_SHARD_REPLICA_HOSTS`, the same `{"db1":"host"}` shape as
 * DB_SHARD_HOSTS, set by Terraform). The read path (prisma-read.service.ts)
 * routes every data part to the copy of its own server; a server without a
 * copy is read from itself, so the map always covers every server.
 */
export function shardReplicaUrlsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  onError: (message: string) => void = () => undefined,
): Record<string, string> {
  const servers = shardDatabaseUrlsFromEnv(env, onError);
  const copies = parseShardDatabaseUrls(env.DB_SHARD_REPLICA_HOSTS, (m) =>
    onError(m.replace(/DATABASE_URL_SHARDS/g, 'DB_SHARD_REPLICA_HOSTS')),
  );
  const out: Record<string, string> = {};
  for (const [key, url] of Object.entries(servers)) {
    const host = copies[key];
    if (!host) {
      out[key] = url;
      continue;
    }
    try {
      const u = new URL(url);
      u.hostname = host;
      out[key] = u.toString();
    } catch {
      out[key] = url;
    }
  }
  return out;
}
