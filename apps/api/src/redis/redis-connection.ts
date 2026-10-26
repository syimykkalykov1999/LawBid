import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
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
  /** `false` = fail fast while disconnected (BullMQ producers). */
  enableOfflineQueue?: boolean;
  /** ioredis auto-pipelining (same-tick commands share one round trip). */
  enableAutoPipelining?: boolean;
  /** `false`: no WRONGPASS/NOAUTH token re-read (default on). */
  authRefresh?: boolean;
}

/** Reconnect delay: ioredis' own `min(times * 50, 2000)` ms, spread over
 * 50-100 % so many tasks do not retry in lockstep after a failover. */
export function jitteredBackoff(
  times: number,
  rand: () => number = Math.random,
): number {
  const base = Math.min(times * 50, 2000);
  return Math.round(base * (0.5 + rand() * 0.5));
}

/** Failover safety (ioredis README «Auto-reconnect»): a connection that
 * still points at a demoted primary answers writes with `READONLY`;
 * returning 2 reconnects (re-resolving the endpoint DNS) and resends the
 * command. */
export function reconnectOnReadonly(err: Error): boolean | 1 | 2 {
  return err.message.startsWith('READONLY') ? 2 : false;
}

/** THE shared connection options of every client, BullMQ included. */
export function redisOptions(): Pick<
  RedisOptions,
  'reconnectOnError' | 'retryStrategy'
> {
  return {
    reconnectOnError: reconnectOnReadonly,
    retryStrategy: (times) => jitteredBackoff(times),
  };
}

// --- WRONGPASS / NOAUTH: the auth token was rotated (docs/runbooks/redis.md)
type UrlProvider = () => string | undefined | Promise<string | undefined>;

/** Default: `REDIS_URL_FILE` (a mounted secret) if set, else `REDIS_URL`
 * from the environment. Replaceable by [setRedisUrlProvider]. */
const defaultUrlProvider: UrlProvider = () => {
  const file = process.env.REDIS_URL_FILE;
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  }
  return process.env.REDIS_URL;
};
let urlProvider: UrlProvider = defaultUrlProvider;

/** Where a client re-reads the current Redis URL (token) after WRONGPASS /
 * NOAUTH. Call with no argument to restore the default. */
export function setRedisUrlProvider(p?: UrlProvider): void {
  urlProvider = p ?? defaultUrlProvider;
}

export function isAuthError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return m.startsWith('WRONGPASS') || m.startsWith('NOAUTH');
}

const AUTH_REFRESH_MIN_GAP_MS = 5000;
const authLog = new Logger('Redis');

/** On WRONGPASS/NOAUTH re-read the secret; if the token changed, switch the
 * client to it and reconnect. Other errors keep ioredis' default logging
 * (a listener would otherwise silence it). Returns the handler for tests. */
export function attachAuthRefresh(
  client: Redis | Cluster,
  now: () => number = Date.now,
): (err: Error) => Promise<boolean> {
  let last = 0;
  const handler = async (err: Error): Promise<boolean> => {
    if (!isAuthError(err)) {
      authLog.warn(`Redis error: ${err.message}`);
      return false;
    }
    if (now() - last < AUTH_REFRESH_MIN_GAP_MS) return false;
    last = now();
    try {
      const fresh = await urlProvider();
      if (!fresh) return false;
      const t = parseRedisUrl(fresh);
      const holder = (
        'redisOptions' in client.options
          ? client.options.redisOptions
          : client.options
      ) as RedisOptions;
      if (holder.password === t.password && holder.username === t.username) {
        return false;
      }
      holder.password = t.password;
      holder.username = t.username;
      authLog.warn('Redis auth rejected: token re-read, reconnecting');
      client.disconnect(true);
      return true;
    } catch (e) {
      authLog.error(`Redis token re-read failed: ${(e as Error).message}`);
      return false;
    }
  };
  client.on('error', (e: Error) => void handler(e));
  return handler;
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
  const base: RedisOptions = { ...redisOptions() };
  if (options.enableOfflineQueue !== undefined) {
    base.enableOfflineQueue = options.enableOfflineQueue;
  }
  if (options.enableAutoPipelining !== undefined) {
    base.enableAutoPipelining = options.enableAutoPipelining;
  }
  if (options.maxRetriesPerRequest !== undefined) {
    base.maxRetriesPerRequest = options.maxRetriesPerRequest;
  }
  if (options.commandTimeout !== undefined) {
    base.commandTimeout = options.commandTimeout;
  }
  if (!isRedisClusterMode(env)) {
    const c = new Redis(url, base);
    if (options.authRefresh !== false) attachAuthRefresh(c);
    return c;
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
    clusterRetryStrategy: (times) =>
      Math.round(Math.min(100 * times, 2000) * (0.5 + Math.random() * 0.5)),
    natMap: natMapOf(env),
    ...(options.enableAutoPipelining !== undefined
      ? { enableAutoPipelining: options.enableAutoPipelining }
      : {}),
  };
  const cluster = new Cluster([{ host: t.host, port: t.port }], clusterOptions);
  if (options.authRefresh !== false) attachAuthRefresh(cluster);
  return cluster as unknown as Redis;
}

/** BullMQ producer (Queue) connection: fail fast while Redis is away
 * (BullMQ «going to production»: disable the offline queue for producers),
 * so a failover turns `queue.add` into a quick error instead of a stall. */
export const PRODUCER_OPTIONS: RedisClientOptions = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 2000,
};

const producers = new Map<string, Redis>();

/** ONE producer connection per process (and URL) shared by every Queue
 * (BullMQ «connections»: Queues may share an ioredis instance; Workers need
 * their own). 40-60 sockets per task become one. */
export function sharedProducer(
  url: string,
  env: RedisEnv = process.env,
): Redis {
  const key = `${isRedisClusterMode(env) ? 'c' : 's'}|${url}`;
  let c = producers.get(key);
  if (!c) {
    c = createRedisClient(url, PRODUCER_OPTIONS, env);
    producers.set(key, c);
  }
  return c;
}

/** Closes the shared producers (app shutdown). */
export async function closeSharedProducers(): Promise<void> {
  const all = [...producers.values()];
  producers.clear();
  for (const c of all) {
    try {
      await c.quit();
    } catch {
      c.disconnect();
    }
  }
}

/**
 * Options for a BullMQ `Queue` / `Worker` of [queueName].
 * - Queue (producer): the shared fail-fast producer connection (above).
 * - Worker (`worker: true`): its own connection, `maxRetriesPerRequest:
 *   null`, default offline queue; standalone it is `{ url, ... }` so BullMQ
 *   creates it, with the shared reconnect options of [redisOptions].
 * Cluster: ioredis Cluster connections and a hash-tag prefix. Default
 * `{queueName}` (BullMQ's Lua scripts touch many keys of one queue, so a
 * queue's keys must share a slot; one tag per queue spreads queues over the
 * shards). `REDIS_BULL_PREFIX` (e.g. `{bull}`) puts every queue in one
 * slot instead — opt in only on an empty Redis: it renames all queues.
 */
export function bullOptions(
  queueName: string,
  url: string,
  opts: { worker?: boolean } = {},
  env: RedisEnv = process.env,
): { connection: any; prefix?: string } {
  if (!isRedisClusterMode(env)) {
    return {
      connection: opts.worker
        ? { url, maxRetriesPerRequest: null, ...redisOptions() }
        : sharedProducer(url, env),
    };
  }
  return {
    connection: opts.worker
      ? createRedisClient(url, { maxRetriesPerRequest: null }, env)
      : sharedProducer(url, env),
    prefix: env.REDIS_BULL_PREFIX?.trim() || `{${queueName}}`,
  };
}
