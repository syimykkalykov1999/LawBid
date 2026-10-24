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
