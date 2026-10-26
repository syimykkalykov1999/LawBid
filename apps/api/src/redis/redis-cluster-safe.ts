import type Redis from 'ioredis';
import type { ChainableCommander } from 'ioredis';
import { isRedisClusterMode, type RedisEnv } from './redis-connection';

/**
 * Helpers that keep multi-key Redis calls valid on a Redis Cluster
 * (docs/architecture/REDIS_CLUSTER_READY.md). With `REDIS_CLUSTER` off every
 * helper is the plain call, byte for byte — standalone behaviour and key
 * names do not change.
 *
 * Rule of the code base: a command, a MULTI or a Lua script that names
 * several keys must name keys of ONE hash slot. Either the keys share a
 * `{tag}` (use [ck]) or the call goes through one of the helpers below.
 * redis-cluster-scan.spec.ts enforces it.
 */

/** Cluster only: `{tag}key`, so every key built with the same tag lives in
 * one slot (one shard). Standalone: the key unchanged. */
export function ck(
  tag: string,
  key: string,
  env: RedisEnv = process.env,
): string {
  return isRedisClusterMode(env) ? `{${tag}}${key}` : key;
}

/** MGET over keys that may sit in different slots. Cluster: parallel GETs
 * (the client routes each); standalone: one MGET. */
export async function mgetSafe(
  redis: Redis,
  keys: string[],
  env: RedisEnv = process.env,
): Promise<(string | null)[]> {
  if (keys.length === 0) return [];
  if (!isRedisClusterMode(env)) return redis.mget(keys);
  return Promise.all(keys.map((k) => redis.get(k)));
}

/** DEL over keys that may sit in different slots. */
export async function delSafe(
  redis: Redis,
  keys: string[],
  env: RedisEnv = process.env,
): Promise<number> {
  if (keys.length === 0) return 0;
  if (!isRedisClusterMode(env)) return redis.del(...keys);
  const parts = await Promise.all(keys.map((k) => redis.del(k)));
  return parts.reduce((a, b) => a + b, 0);
}

/** CRC16/XMODEM of [data] (Redis Cluster key hashing). */
function crc16(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** Hash slot of a key, honouring the first non-empty `{hash tag}`. */
export function keySlot(key: string | Buffer): number {
  const buf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const open = buf.indexOf('{');
  if (open !== -1) {
    const close = buf.indexOf('}', open + 1);
    if (close > open + 1) return crc16(buf.subarray(open + 1, close)) % 16384;
  }
  return crc16(buf) % 16384;
}

/** EXISTS over keys that may sit in different slots (count of existing). */
export async function existsSafe(
  redis: Redis,
  keys: string[],
  env: RedisEnv = process.env,
): Promise<number> {
  if (keys.length === 0) return 0;
  if (!isRedisClusterMode(env)) return redis.exists(...keys);
  const parts = await Promise.all(keys.map((k) => redis.exists(k)));
  return parts.reduce((a, b) => a + b, 0);
}

interface Queued {
  name: string;
  args: unknown[];
}

/** Slot of the first key of a queued command (eval-style: after numkeys). */
function slotOf(c: Queued): number | undefined {
  const lower = c.name.toLowerCase();
  const arg = lower === 'eval' || lower === 'evalsha' ? c.args[2] : c.args[0];
  return typeof arg === 'string' || Buffer.isBuffer(arg)
    ? keySlot(arg)
    : undefined;
}

/**
 * A NON-atomic pipeline whose commands may touch different slots.
 * Standalone: `redis.pipeline()` itself. Cluster: commands are queued, split
 * by node group and sent as one real pipeline per group; `exec()` returns the
 * results in the original order (same `[error, result][]` shape).
 */
export function pipeline(
  redis: Redis,
  env: RedisEnv = process.env,
): ChainableCommander {
  if (!isRedisClusterMode(env)) return redis.pipeline();
  const queue: Queued[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'exec') {
          return async () => {
            const groups = new Map<string, number[]>();
            queue.forEach((c, i) => {
              const slot = slotOf(c);
              const groupMap = (
                redis as unknown as {
                  _groupsBySlot?: Record<number, number>;
                }
              )._groupsBySlot;
              const g =
                slot === undefined
                  ? 'none'
                  : String(groupMap?.[slot] ?? `slot:${slot}`);
              (groups.get(g) ?? groups.set(g, []).get(g)!).push(i);
            });
            const out: [Error | null, unknown][] = Array.from({
              length: queue.length,
            });
            await Promise.all(
              [...groups.values()].map(async (idx) => {
                const p = redis.pipeline() as unknown as Record<
                  string,
                  (...a: unknown[]) => unknown
                >;
                for (const i of idx) p[queue[i].name](...queue[i].args);
                const res =
                  (await (p as unknown as ChainableCommander).exec()) ?? [];
                idx.forEach((i, k) => {
                  out[i] = res[k];
                });
              }),
            );
            return out;
          };
        }
        if (prop === 'then') return undefined;
        return (...args: unknown[]) => {
          queue.push({ name: prop, args });
          return proxy;
        };
      },
    },
  );
  return proxy as ChainableCommander;
}
