import Redis, {
  Cluster,
  type ClusterOptions,
  type RedisOptions,
} from 'ioredis';

/**
 * THE one place that creates Redis connections (docs/architecture/
 * REDIS_CLUSTER_READY.md). Standalone by default; with `REDIS_CLUSTER=true`
 * the same URL is used as the cluster *configuration endpoint* of an
 * ElastiCache "cluster mode enabled" group and every client becomes an
 * ioredis `Cluster`. A test (redis-cluster-scan.spec.ts) forbids
 * `new Redis(` / `new Cluster(` / `{ connection: { url } }` anywhere else.
 *
 * Sources (2025-2026): socket.io Redis adapter docs (sharded + ioredis
 * `Cluster` with `shardedSubscribers: true`, needs ioredis >= 5.9, Redis 7);
 * BullMQ "Redis Cluster" pattern (a `{hash tag}` in the prefix); ioredis
 * README «AWS ElastiCache Clusters with TLS» (`dnsLookup` identity +
 * `redisOptions.tls`).
 */

export type RedisEnv = Record<string, string | undefined>;

export function isRedisClusterMode(env: RedisEnv = process.env): boolean {
  const v = env.REDIS_CLUSTER?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

export interface RedisTarget {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
}

export function parseRedisUrl(url: string): RedisTarget {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === 'rediss:',
  };
}

export interface RedisClientOptions {
  /** ms a command may wait (the HTTP-path clients); omit for none. */
  commandTimeout?: number;
  /** `null` for BullMQ workers (blocking commands). */
  maxRetriesPerRequest?: number | null;
}

/** REDIS_CLUSTER_NAT_MAP='{"10.0.0.1:6379":{"host":"localhost","port":7000}}'
 * — only for a local docker cluster that announces internal addresses. */
function natMapOf(env: RedisEnv): ClusterOptions['natMap'] | undefined {
  const raw = env.REDIS_CLUSTER_NAT_MAP;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ClusterOptions['natMap'];
  } catch {
    return undefined;
  }
}

/** A standalone `Redis` or a `Cluster` — both have get/set/eval/multi/
 * duplicate/quit, so callers keep the `Redis` type. */
export function createRedisClient(
  url: string,
  options: RedisClientOptions = {},
  env: RedisEnv = process.env,
): Redis {
  const base: RedisOptions = {};
  if (options.maxRetriesPerRequest !== undefined) {
    base.maxRetriesPerRequest = options.maxRetriesPerRequest;
  }
  if (options.commandTimeout !== undefined) {
    base.commandTimeout = options.commandTimeout;
  }
  if (!isRedisClusterMode(env)) {
    return new Redis(url, base);
  }
  const t = parseRedisUrl(url);
  const clusterOptions: ClusterOptions = {
    redisOptions: {
      ...base,
      username: t.username,
      password: t.password,
      ...(t.tls ? { tls: {} } : {}),
    },
    // ElastiCache TLS: connect to the announced name, do not re-resolve it
    // to an IP (the certificate carries names, not addresses).
    dnsLookup: (address, callback) => callback(null, address),
    // Redis 7 sharded pub/sub (SSUBSCRIBE) for the Socket.IO adapter.
    shardedSubscribers: true,
    slotsRefreshTimeout: 2000,
    clusterRetryStrategy: (times) => Math.min(100 * times, 2000),
    natMap: natMapOf(env),
  };
  return new Cluster(
    [{ host: t.host, port: t.port }],
    clusterOptions,
  ) as unknown as Redis;
}

/**
 * Options for a BullMQ `Queue` / `Worker` of [queueName]. Standalone:
 * exactly what the code passed before (`{ connection: { url } }`, workers
 * with `maxRetriesPerRequest: null`). Cluster: an ioredis Cluster
 * connection and the prefix `{queueName}` — BullMQ's Lua scripts touch many
 * keys of one queue, so every key of a queue must share one hash slot; one
 * tag per queue still spreads different queues over the shards.
 */
export function bullOptions(
  queueName: string,
  url: string,
  opts: { worker?: boolean } = {},
  env: RedisEnv = process.env,
): { connection: any; prefix?: string } {
  if (!isRedisClusterMode(env)) {
    return {
      connection: opts.worker ? { url, maxRetriesPerRequest: null } : { url },
    };
  }
  return {
    connection: createRedisClient(
      url,
      opts.worker ? { maxRetriesPerRequest: null } : {},
      env,
    ),
    prefix: `{${queueName}}`,
  };
}
