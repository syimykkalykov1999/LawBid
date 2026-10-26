/* eslint-disable @typescript-eslint/require-await */
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  COUNTER_SHARDS,
  CounterAggregator,
  counterShard,
  legacyKey,
  pendingKey,
} from './counter-aggregator.service';

/** Small in-memory Redis: just the commands the aggregator uses. The Lua
 * scripts are recognised by their content and re-implemented here. */
function fakeRedis() {
  const hashes = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  const evalCalls: { keys: string[]; args: unknown[] }[] = [];
  const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const redis = {
    set: async (k: string, v: string) => {
      if (strings.has(k)) return null;
      strings.set(k, v);
      return 'OK';
    },
    eval: async (script: string, n: number, ...rest: (string | number)[]) => {
      const keys = rest.slice(0, n).map(String);
      const args = rest.slice(n);
      if (script.includes("redis.call('PEXPIRE'")) return 1;
      if (
        script.includes("redis.call('DEL', KEYS[1])") &&
        !script.includes('HMGET')
      ) {
        strings.delete(keys[0]);
        return 1;
      }
      if (script.includes("'HINCRBY', KEYS[1], ARGV[i]")) {
        evalCalls.push({ keys, args });
        for (let i = 1; i < args.length; i += 2) {
          const m = h(keys[0]);
          m.set(
            String(args[i]),
            (m.get(String(args[i])) ?? 0) + Number(args[i + 1]),
          );
          (sets.get(keys[1]) ?? sets.set(keys[1], new Set()).get(keys[1])!).add(
            String(args[i]),
          );
        }
        return 1;
      }
      if (script.includes('HMGET')) {
        const m = h(keys[0]);
        const vals = args.map((a) =>
          m.has(String(a)) ? String(m.get(String(a))) : null,
        );
        args.forEach((a) => m.delete(String(a)));
        return vals;
      }
      throw new Error('unknown script');
    },
    hmget: async (k: string, ...ids: string[]) =>
      ids.map((i) =>
        hashes.get(k)?.has(i) ? String(hashes.get(k)!.get(i)) : null,
      ),
    hscan: async (k: string) => [
      '0',
      [...(hashes.get(k)?.entries() ?? [])].flatMap(([a, b]) => [a, String(b)]),
    ],
    exists: async (k: string) => (strings.has(k) ? 1 : 0),
    hdel: async (k: string, ...ids: string[]) => {
      ids.forEach((i) => hashes.get(k)?.delete(i));
      return 1;
    },
    spop: async () => [],
    multi: () => ({ hincrby: () => undefined, exec: async () => [] }),
  };
  return { redis: redis as unknown as Redis, hashes, sets, evalCalls, strings };
}

function aggregator(r: Redis) {
  const executed: { keep: string[]; deltas: number[] }[] = [];
  const prisma = {
    // tagged-template: Prisma.sql values are [table.., keep, deltas]
    $executeRaw: jest.fn(async (q: { values: unknown[] }) => {
      const arrays = q.values.filter(Array.isArray) as unknown[][];
      executed.push({
        keep: arrays[0] as string[],
        deltas: arrays[1] as number[],
      });
      return 1;
    }),
  } as unknown as PrismaService;
  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
  return { agg: new CounterAggregator(prisma, r, logger), executed };
}

const ID = (last: string, n = 0) =>
  `00000000-0000-4000-8000-0000000000${n}${last}`;

describe('CounterAggregator (S6-6)', () => {
  it('shards by the last hex digit of the id (id % 16), 16 shards', () => {
    expect(COUNTER_SHARDS).toBe(16);
    expect(counterShard(ID('0'))).toBe(0);
    expect(counterShard(ID('a'))).toBe(10);
    expect(counterShard(ID('F'))).toBe(15);
    const s = counterShard('not-a-uuid-zz');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(16);
  });

  it('bump touches no Redis; 1000 likes of one post become ONE HINCRBY of the right shard', async () => {
    const { redis, hashes, evalCalls } = fakeRedis();
    const spy = jest.spyOn(redis, 'eval');
    const { agg } = aggregator(redis);
    const id = ID('3');
    for (let i = 0; i < 1000; i += 1)
      await agg.bump('post', id, 'like_count', 1);
    expect(spy).not.toHaveBeenCalled();
    await agg.flushLocal();
    expect(evalCalls).toHaveLength(1);
    expect(hashes.get(pendingKey('post', 'like_count', 3))?.get(id)).toBe(1000);
    expect(hashes.get(legacyKey('post', 'like_count'))).toBeUndefined();
  });

  it('a read during flushLocal still sees the delta once (read-your-writes)', async () => {
    const { redis } = fakeRedis();
    const { agg } = aggregator(redis);
    const id = ID('4');
    await agg.bump('post', id, 'like_count', 2);
    // The Redis write is in flight: the delta is neither local nor in Redis.
    const realEval = redis.eval.bind(redis);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    jest
      .spyOn(redis, 'eval')
      .mockImplementationOnce(async (...a: Parameters<Redis['eval']>) => {
        await gate;
        return realEval(...a);
      });
    const flushing = agg.flushLocal();
    expect((await agg.pending('post', 'like_count', [id])).get(id)).toBe(2);
    release();
    await flushing;
    expect((await agg.pending('post', 'like_count', [id])).get(id)).toBe(2);
  });

  it('a read while the database update runs still sees the drained delta once', async () => {
    const { redis } = fakeRedis();
    const { agg } = aggregator(redis);
    const id = ID('5');
    await agg.bump('post', id, 'like_count', 3);
    await agg.flushLocal();
    let during: number | undefined;
    const prisma = (agg as unknown as { prisma: PrismaService }).prisma;
    (prisma.$executeRaw as unknown as jest.Mock).mockImplementationOnce(
      async () => {
        during = (await agg.pending('post', 'like_count', [id])).get(id);
        return 1;
      },
    );
    await agg.flush();
    expect(during).toBe(3);
    // Committed: no longer pending (the row holds it now).
    expect((await agg.pending('post', 'like_count', [id])).get(id)).toBe(
      undefined,
    );
  });

  it('an explicit flush waits for a flush already running elsewhere, then lands its deltas', async () => {
    const { redis, strings } = fakeRedis();
    const { agg, executed } = aggregator(redis);
    const id = ID('6');
    await agg.bump('post', id, 'like_count', 3);
    // Another pod (or the 10-second timer) holds the flush lock.
    strings.set('lock:job:counters.flush', 'other');
    setTimeout(() => strings.delete('lock:job:counters.flush'), 250);
    await agg.flush();
    expect(executed.flatMap((e) => e.keep)).toContain(id);
    // The timer does not wait: with the lock held it does nothing.
    strings.set('lock:job:counters.flush', 'other');
    await agg.bump('post', id, 'like_count', 1);
    expect((await agg.flush({ waitForRunning: false })).rows).toBe(0);
  });

  it('ids of different shards go to different hash keys, in one EVAL each', async () => {
    const { redis, hashes, evalCalls } = fakeRedis();
    const { agg } = aggregator(redis);
    await agg.bump('post', ID('1'), 'like_count', 2);
    await agg.bump('post', ID('2'), 'like_count', 5);
    await agg.bump('post', ID('2', 2), 'like_count', -1);
    await agg.flushLocal();
    expect(evalCalls).toHaveLength(2);
    expect(hashes.get(pendingKey('post', 'like_count', 1))?.get(ID('1'))).toBe(
      2,
    );
    expect(hashes.get(pendingKey('post', 'like_count', 2))?.size).toBe(2);
  });

  it('pending() = Redis shard + legacy hash + this process’ unsent deltas', async () => {
    const { redis, hashes } = fakeRedis();
    const { agg } = aggregator(redis);
    const a = ID('4');
    const b = ID('5');
    hashes.set(pendingKey('post', 'like_count', 4), new Map([[a, 3]]));
    hashes.set(legacyKey('post', 'like_count'), new Map([[a, 2]]));
    await agg.bump('post', b, 'like_count', 7);
    await agg.bump('post', a, 'like_count', 1);
    const p = await agg.pending('post', 'like_count', [a, b, ID('6')]);
    expect(p.get(a)).toBe(6);
    expect(p.get(b)).toBe(7);
    expect(p.has(ID('6'))).toBe(false);
  });

  it('flush() sends local deltas, drains every shard and the legacy hash into the DB, same totals', async () => {
    const { redis, hashes } = fakeRedis();
    const { agg, executed } = aggregator(redis);
    hashes.set(legacyKey('post', 'like_count'), new Map([[ID('9'), 4]]));
    hashes.set(pendingKey('post', 'like_count', 7), new Map([[ID('7'), 2]]));
    await agg.bump('post', ID('7'), 'like_count', 3);
    await agg.bump('post', ID('c'), 'like_count', -1);
    const out = await agg.flush();
    expect(out.rows).toBe(3);
    const applied = new Map<string, number>();
    for (const e of executed)
      e.keep.forEach((id, i) => applied.set(id, e.deltas[i]));
    expect(applied.get(ID('7'))).toBe(5);
    expect(applied.get(ID('9'))).toBe(4);
    expect(applied.get(ID('c'))).toBe(-1);
    // everything drained
    for (const m of hashes.values()) expect(m.size).toBe(0);
    // the first flush still found legacy data; the second one finds none,
    // and reads stop asking for the legacy hash
    await agg.flush();
    const spy = jest.spyOn(redis, 'hmget');
    await agg.pending('post', 'like_count', [ID('7')]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a Redis error keeps the deltas for the next second', async () => {
    const { redis } = fakeRedis();
    const { agg } = aggregator(redis);
    const real = redis.eval.bind(redis);
    let fail = true;
    (redis as unknown as { eval: unknown }).eval = async (
      ...a: Parameters<Redis['eval']>
    ) => {
      if (fail) throw new Error('down');
      return (real as (...x: unknown[]) => unknown)(...a);
    };
    await agg.bump('post', ID('1'), 'like_count', 4);
    await expect(agg.flushLocal()).rejects.toThrow('down');
    expect(
      (await agg.pending('post', 'like_count', [ID('1')])).get(ID('1')),
    ).toBe(4);
    fail = false;
    await agg.flushLocal();
    expect(
      (await redis.hmget(pendingKey('post', 'like_count', 1), ID('1')))[0],
    ).toBe('4');
  });
});
