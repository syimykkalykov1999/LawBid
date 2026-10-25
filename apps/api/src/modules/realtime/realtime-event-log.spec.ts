/* eslint-disable @typescript-eslint/require-await -- hand-made Redis / socket fakes */
import type Redis from 'ioredis';
import {
  EVENT_LOG_MAX,
  EVENT_LOG_MAX_BYTES,
  EVENT_LOG_WINDOW_MS,
  RealtimeEventLog,
} from './realtime-event-log';

/** A just-enough Redis: sorted sets, a pipeline, GET and the seq script. */
function fakeRedis(clock: () => number) {
  const zsets = new Map<string, { score: number; member: string }[]>();
  let last = 0;
  let epoch: string | null = null;
  const z = (k: string) => {
    let v = zsets.get(k);
    if (!v) zsets.set(k, (v = []));
    return v;
  };
  const num = (v: string) =>
    v === '-inf' ? -Infinity : v === '+inf' ? Infinity : Number(v);
  const ops = {
    zadd: (k: string, score: number, member: string) => {
      const v = z(k);
      if (!v.some((e) => e.member === member)) v.push({ score, member });
      v.sort((a, b) => a.score - b.score);
      return 1;
    },
    zremrangebyscore: (k: string, min: string, max: string) => {
      const exclusive = max.startsWith('(');
      const hi = num(exclusive ? max.slice(1) : max);
      zsets.set(
        k,
        z(k).filter(
          (e) =>
            !(
              e.score >= num(min) && (exclusive ? e.score < hi : e.score <= hi)
            ),
        ),
      );
      return 1;
    },
    zremrangebyrank: (k: string, start: number, stop: number) => {
      const v = z(k);
      const hi = stop < 0 ? v.length + stop : stop;
      v.splice(start, Math.max(0, hi - start + 1));
      return 1;
    },
    expire: () => 1,
    zcard: (k: string) => z(k).length,
    zrangebyscore: (
      k: string,
      min: string,
      max: string,
      ...rest: unknown[]
    ) => {
      const exclusive = min.startsWith('(');
      const lo = num(exclusive ? min.slice(1) : min);
      const hits = z(k).filter(
        (e) =>
          (exclusive ? e.score > lo : e.score >= lo) && e.score <= num(max),
      );
      if (rest[0] === 'WITHSCORES') {
        return hits.slice(0, 1).flatMap((e) => [e.member, String(e.score)]);
      }
      return hits.map((e) => e.member);
    },
  };
  const redis = {
    eval: jest.fn(async (script: string, n: number, ...rest: unknown[]) => {
      if (script.includes("'ZADD'")) {
        // the batch append: [keys..., seq, member, floor, max, ttl]
        const keys = rest.slice(0, n) as string[];
        const [seq, member, floor, max] = rest.slice(n) as [
          number,
          string,
          number,
          number,
        ];
        for (const k of keys) {
          ops.zadd(k, seq, member);
          ops.zremrangebyscore(k, '-inf', `(${floor}`);
          ops.zremrangebyrank(k, 0, -(max + 1));
        }
        return keys.length;
      }
      const now = clock() * 1000;
      last = last >= now ? last + 1 : now;
      epoch ??= String(now - 1);
      return last;
    }),
    get: jest.fn(async (k: string) =>
      k === 'rt:epoch' ? epoch : String(last),
    ),
    set: jest.fn(async (_k: string, v: number) => {
      epoch ??= String(v);
      return 'OK';
    }),
    time: jest.fn(async () => [Math.floor(clock() / 1000), 0]),
    flushEpoch: () => {
      epoch = null;
    },
    pipeline: () => {
      const queue: (() => unknown)[] = [];
      const p: Record<string, unknown> = {};
      for (const [name, fn] of Object.entries(ops)) {
        p[name] = (...a: unknown[]) => {
          queue.push(() => (fn as (...x: unknown[]) => unknown)(...a));
          return p;
        };
      }
      p.exec = async () => queue.map((q) => [null, q()]);
      return p;
    },
  };
  return redis as unknown as Redis;
}

describe('RealtimeEventLog (owner 2026-10-23)', () => {
  let now = 1_800_000_000_000;
  const clock = () => now;
  let log: RealtimeEventLog;
  beforeEach(() => {
    now = 1_800_000_000_000;
    log = new RealtimeEventLog(fakeRedis(clock));
  });

  it('hands out strictly increasing cursors, also inside one millisecond', async () => {
    const a = await log.nextSeq();
    const b = await log.nextSeq();
    const c = await log.nextSeq();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('returns only the events after the cursor, oldest first', async () => {
    const s1 = await log.nextSeq();
    await log.append(['u1'], s1, 'message:new', { id: 1, seq: s1 });
    now += 1000;
    const s2 = await log.nextSeq();
    await log.append(['u1', 'u2'], s2, 'badge:update', { total: 3, seq: s2 });

    const all = await log.since(['u1'], s1 - 1, now);
    expect(all.complete).toBe(true);
    expect(all.events.map((e) => e.seq)).toEqual([s1, s2]);

    const after1 = await log.since(['u1'], s1, now);
    expect(after1.events.map((e) => e.event)).toEqual(['badge:update']);
    expect(after1.seq).toBe(s2);

    // u2 only has the second one; nothing leaks across people.
    const other = await log.since(['u2'], s1, now);
    expect(other.events.map((e) => e.seq)).toEqual([s2]);
  });

  it('one event sent to an assistant and the attorney is returned once', async () => {
    const s = await log.nextSeq();
    await log.append(['att', 'asst'], s, 'message:new', { seq: s });
    const r = await log.since(['att', 'asst'], s - 1, now);
    expect(r.events).toHaveLength(1);
  });

  it('a cursor older than 5 minutes is incomplete', async () => {
    const s = await log.nextSeq();
    await log.append(['u1'], s, 'message:new', {});
    now += EVENT_LOG_WINDOW_MS + 1000;
    const r = await log.since(['u1'], s, now);
    expect(r.complete).toBe(false);
    expect((await log.since(['u1'], 0, now)).complete).toBe(false);
  });

  it('an overflowed list is incomplete, a recent cursor is not', async () => {
    let first = 0;
    for (let i = 0; i < EVENT_LOG_MAX + 5; i++) {
      now += 1;
      const s = await log.nextSeq();
      if (i === 0) first = s;
      await log.append(['u1'], s, 'x', { i });
    }
    expect((await log.since(['u1'], first, now)).complete).toBe(false);
    const recent = await log.nextSeq();
    expect((await log.since(['u1'], recent - 1, now)).complete).toBe(true);
  });

  it('Redis lost its data: an older cursor is incomplete (S1-2)', async () => {
    const redis = fakeRedis(clock);
    const l = new RealtimeEventLog(redis);
    const s1 = await l.nextSeq();
    await l.append(['u1'], s1, 'message:new', {});
    // healthy: a cursor from this life is complete
    expect((await l.since(['u1'], s1 - 1, now)).complete).toBe(true);
    // failover to an empty node: the canary is gone, the log restarts
    now += 60_000;
    (redis as unknown as { flushEpoch: () => void }).flushEpoch();
    const lost = await l.since(['u1'], s1, now);
    expect(lost.complete).toBe(false);
    // the client continues from the new cursor and is complete again
    expect((await l.since(['u1'], lost.seq, now)).complete).toBe(true);
  });

  it('an oversized payload is logged as a marker only', async () => {
    const s = await log.nextSeq();
    await log.append(['u1'], s, 'big', {
      text: 'x'.repeat(EVENT_LOG_MAX_BYTES),
    });
    const [e] = (await log.since(['u1'], s - 1, now)).events;
    expect(e).toEqual({ seq: s, event: 'big', truncated: true });
  });
});
