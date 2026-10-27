/* eslint-disable @typescript-eslint/require-await -- fakes and sync-bodied interface methods */
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { LeaseLostError } from './move-types';
import type { LeaseHandle, MoveLease } from './shard-move.runner';

/**
 * One shard move at a time, across all API / worker processes and the CLI:
 * a Redis lease (`SET NX PX`) with a random token. Every `assertHeld()`
 * extends it, but only while the token is still ours (compare-and-extend in
 * Lua); a runner that stalled past the TTL finds the lease gone and stops
 * with `LeaseLostError` instead of fighting the new owner.
 */
const EXTEND = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

export const MOVE_LEASE_KEY = 'lawbid:shard-move:lease';
export const MOVE_LEASE_TTL_MS = 60_000;

export class RedisMoveLease implements MoveLease {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs = MOVE_LEASE_TTL_MS,
    private readonly key = MOVE_LEASE_KEY,
  ) {}

  async acquire(): Promise<LeaseHandle | null> {
    const token = randomUUID();
    const ok = await this.redis.set(this.key, token, 'PX', this.ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return {
      assertHeld: async () => {
        const r = await this.redis.eval(
          EXTEND,
          1,
          this.key,
          token,
          String(this.ttlMs),
        );
        if (Number(r) !== 1) throw new LeaseLostError();
      },
      release: async () => {
        await this.redis.eval(RELEASE, 1, this.key, token);
      },
    };
  }

  /** Is anybody running a move right now (admin "in progress" light)? */
  async held(): Promise<boolean> {
    return (await this.redis.exists(this.key)) === 1;
  }
}

/** Same contract in memory: tests, and a CLI run without Redis. */
export class MemoryMoveLease implements MoveLease {
  private token: string | null = null;
  async acquire(): Promise<LeaseHandle | null> {
    if (this.token) return null;
    const mine = randomUUID();
    this.token = mine;
    return {
      assertHeld: async () => {
        if (this.token !== mine) throw new LeaseLostError();
      },
      release: async () => {
        if (this.token === mine) this.token = null;
      },
    };
  }
  /** Test hook: another runner takes the lease. */
  steal(): void {
    this.token = randomUUID();
  }
}
