import type { Redis } from 'ioredis';

/**
 * Atomic INCR + EXPIRE-on-first-hit (audit B-4, 2026-11-01). Two separate
 * commands leave a counter without a TTL forever when the process dies or
 * Redis fails over between them (a permanent "too many codes today").
 * Single key, so it is safe on Redis Cluster.
 */
const INCR_WITH_TTL_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return n
`;

export async function incrWithTtl(
  redis: Pick<Redis, 'eval'>,
  key: string,
  ttlSec: number,
): Promise<number> {
  return Number(await redis.eval(INCR_WITH_TTL_LUA, 1, key, String(ttlSec)));
}
