import type Redis from 'ioredis';

/**
 * Owner 2026-11-11 («Масштаб» без AWS): the load of the database and Redis
 * read from the services themselves, for a stand without CloudWatch (own
 * servers, the Mac). Same numbers the AWS path reads, from their sources:
 *  - connections: pg_stat_activity of this database / SHOW max_connections
 *    (the RDS metric DatabaseConnections counts the same sessions);
 *  - Redis memory: INFO memory used_memory / maxmemory (ElastiCache's
 *    DatabaseMemoryUsagePercentage is used_memory / maxmemory as well);
 *  - database CPU: only from a Prometheus the operator names
 *    (OPS_PROMETHEUS_URL + OPS_DB_CPU_QUERY, e.g. node_exporter), else null:
 *    PostgreSQL cannot tell its host's CPU.
 * Every reading that fails is null (never a guessed number).
 */
export interface SqlReader {
  $queryRaw<T>(sql: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export async function selfHostDbConnections(
  db: SqlReader,
): Promise<{ connections: number | null; max: number | null }> {
  try {
    const [row] = await db.$queryRaw<{ connections: number; max: number }[]>`
      SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections,
             current_setting('max_connections')::int AS max`;
    return {
      connections: Number.isFinite(row?.connections) ? row.connections : null,
      max: Number.isFinite(row?.max) && row.max > 0 ? row.max : null,
    };
  } catch {
    return { connections: null, max: null };
  }
}

/** used_memory / maxmemory in percent; without a maxmemory the machine's
 * total memory; null when neither is known. */
export function redisMemoryPercentFromInfo(info: string): number | null {
  const v = (k: string) => {
    const m = new RegExp(`^${k}:(\\d+)`, 'm').exec(info);
    return m ? Number(m[1]) : 0;
  };
  const used = v('used_memory');
  const cap = v('maxmemory') || v('total_system_memory');
  if (!used || !cap) return null;
  return Math.round((used / cap) * 1000) / 10;
}

export async function selfHostRedisMemoryPercent(
  redis: Pick<Redis, 'info'> | undefined,
): Promise<number | null> {
  if (!redis) return null;
  try {
    return redisMemoryPercentFromInfo(await redis.info('memory'));
  } catch {
    return null;
  }
}

/** One instant value of a PromQL query (`/api/v1/query`), or null. */
export async function prometheusValue(
  baseUrl: string | undefined,
  query: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (!baseUrl || !query) return null;
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { result?: { value?: [number, string] }[] };
    };
    const n = Number(body.data?.result?.[0]?.value?.[1]);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  } catch {
    return null;
  }
}
