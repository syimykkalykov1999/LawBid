import { AsyncLocalStorage } from 'node:async_hooks';
import { LOGICAL_SHARDS, hashShard, shardOf } from './shard-id';

/**
 * Shard-ready step 4 (docs/architecture/SHARDING_READY.md §5): the shard
 * context. It tells `PrismaService` which logical shard the current async
 * chain works on, so the ~3,300 bare `this.prisma.x` calls need no edit.
 *
 *  - HTTP: `ShardContextInterceptor` sets it from the route (case /
 *    conversation / user params) or, failing that, from the signed-in user.
 *  - Sockets (Socket.IO gateways): `shardContext.runForUser(userId, fn)`
 *    around the handler body.
 *  - BullMQ jobs: put `shardKey: shardKeyOf.case(id)` (or `.user`, `.shard`)
 *    into the job data and run the handler in `shardContext.runFromKey(
 *    data.shardKey, fn)`. No key = primary.
 *  - Webhooks: `runForCase(caseId, fn)` / `runForUser(userId, fn)` once the
 *    entity is known.
 *
 * No context means the primary database and never an error: with a single
 * physical database every shard maps to `primary`, so a missing context is
 * harmless today. A query on a sharded-family table made WITHOUT a context
 * is counted (`shardStats`, log line `shard_no_context`) so the later steps
 * (docs §7 steps 6 to 9) can find and fix those call sites.
 *
 * Module-level singleton on purpose, like `demoContext`: PrismaService's
 * constructor needs it before Nest's DI graph exists.
 */
export interface ShardStore {
  /** Logical shard 0..255; undefined = decided by `physical` or primary. */
  readonly shard?: number;
  /** Explicit physical database key (admin / migration tools). */
  readonly physical?: string;
  /** Where the context came from, for logs. */
  readonly source: string;
}

/** Job-data friendly shard key: `shard:12`, `case:<uuid>`, `user:<uuid>`. */
export type ShardKeyString = string;

export const shardKeyOf = {
  shard: (shard: number): ShardKeyString => `shard:${shard}`,
  case: (caseId: string): ShardKeyString => `case:${caseId}`,
  user: (userId: string): ShardKeyString => `user:${userId}`,
};

const KEY_RE =
  /^(?:(shard):(\d{1,3})|(case|user):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/i;

/** Parses a shard key; null for anything unknown (falls back to primary). */
export function parseShardKey(
  key: unknown,
): { shard: number; source: string } | null {
  if (typeof key !== 'string') return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  if (m[1] === 'shard') {
    const n = Number(m[2]);
    return n < LOGICAL_SHARDS ? { shard: n, source: 'key' } : null;
  }
  const id = m[4];
  return {
    shard: m[3] === 'case' ? shardOf(id) : hashShard(id),
    source: 'key',
  };
}

class ShardContext {
  private readonly als = new AsyncLocalStorage<ShardStore>();

  current(): ShardStore | undefined {
    return this.als.getStore();
  }

  /** The current logical shard as a job-data key (`shard:N`), or undefined
   * without a context: enqueue code spreads `{ shardKey: ... }` into the job
   * so the worker can `runFromKey` it. */
  currentKey(): ShardKeyString | undefined {
    const shard = this.als.getStore()?.shard;
    return shard === undefined ? undefined : shardKeyOf.shard(shard);
  }

  /** Runs `fn` on a logical shard. */
  run<T>(shard: number, fn: () => T, source = 'explicit'): T {
    if (!Number.isInteger(shard) || shard < 0 || shard >= LOGICAL_SHARDS) {
      return fn();
    }
    return this.als.run({ shard, source }, fn);
  }

  /** The shard of a case (or of anything of the case family: bid, conversation,
   * message, call ... their ids carry the case shard). */
  runForCase<T>(caseId: string, fn: () => T, source = 'case'): T {
    return this.run(safeShard(shardOf, caseId), fn, source);
  }

  /** The shard of a user's own data (notifications, saved items, follows ...). */
  runForUser<T>(userId: string, fn: () => T, source = 'user'): T {
    return this.run(safeShard(hashShard, userId), fn, source);
  }

  /** Job / socket helper: `key` comes from the job data; missing or unknown
   * means primary (no context). */
  runFromKey<T>(key: unknown, fn: () => T): T {
    const parsed = parseShardKey(key);
    return parsed ? this.run(parsed.shard, fn, 'key') : fn();
  }

  /** Pins a physical database by key (admin tools, migration runner). */
  runOnPhysical<T>(physical: string, fn: () => T): T {
    return this.als.run({ physical, source: 'physical' }, fn);
  }

  /** Leaves any outer shard context: the primary database. */
  runOnPrimary<T>(fn: () => T): T {
    return this.als.run({ physical: 'primary', source: 'primary' }, fn);
  }
}

/** shard of `id`, or -1 (= no context) when `id` is not a uuid. */
function safeShard(f: (id: string) => number, id: string): number {
  try {
    return f(id);
  } catch {
    return -1;
  }
}

export const shardContext = new ShardContext();

/** Spread into job data when enqueueing: carries the current shard context
 * (nothing without one). The worker restores it with `runFromKey`. */
export function shardCarry(): { shardKey?: ShardKeyString } {
  const shardKey = shardContext.currentKey();
  return shardKey ? { shardKey } : {};
}
