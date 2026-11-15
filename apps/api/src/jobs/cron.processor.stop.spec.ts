import { CronProcessor } from './cron.processor';
import { RENEW } from './handlers/job-lock';
import {
  currentJobSignal,
  throwIfJobStopped,
} from '../common/queues/job-signal';
import { CRON_RUNS_KEY } from './cron-run';

/**
 * Batch D (14.11): cron.processor.ts ignored the lock-lost signal — after a
 * Redis restart the old run went on while a second copy started; no run had
 * a time limit; skips of frequent jobs were silent; no last good run.
 */
function fakeRedis() {
  const kv = new Map<string, string>();
  const hash = new Map<string, string>();
  const state = { lose: false };
  const redis = {
    set: jest.fn((k: string, v: string) => {
      if (kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    eval: jest.fn((script: string, _n: number, k: string, token: string) => {
      if (script === RENEW) {
        if (state.lose) kv.delete(k);
        return Promise.resolve(kv.get(k) === token ? 1 : 0);
      }
      // RELEASE (compare-and-del)
      if (kv.get(k) === token) {
        kv.delete(k);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
    hsetnx: jest.fn((_k: string, f: string, v: string) => {
      if (!hash.has(f)) hash.set(f, v);
      return Promise.resolve(1);
    }),
    hget: jest.fn((_k: string, f: string) =>
      Promise.resolve(hash.get(f) ?? null),
    ),
    hset: jest.fn((_k: string, f: string, v: string) => {
      hash.set(f, v);
      return Promise.resolve(1);
    }),
    hgetall: jest.fn(() => Promise.resolve(Object.fromEntries(hash))),
  };
  return { redis, kv, hash, state };
}

function settings(values: Record<string, string | number> = {}) {
  const all: Record<string, string | number> = {
    'ops.cron_timeout_mode': 'auto',
    'ops.cron_timeout_auto_factor': 10,
    'ops.cron_timeout_auto_min_minutes': 60,
    'ops.cron_timeout_history_runs': 20,
    'ops.cron_timeout_minutes': '',
    'ops.cron_skip_log_every': 3,
    ...values,
  };
  return {
    string: jest.fn((k: string) => Promise.resolve(String(all[k] ?? ''))),
    number: jest.fn((k: string) => Promise.resolve(Number(all[k] ?? 0))),
  };
}

function make(
  dispatch: (name: string) => Promise<unknown>,
  opts: { values?: Record<string, string | number> } = {},
) {
  const r = fakeRedis();
  const p = Object.create(CronProcessor.prototype) as CronProcessor;
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  Object.assign(p, {
    logger,
    redis: r.redis,
    appSettings: settings(opts.values),
    dispatch,
  });
  return { p, logger, ...r };
}

const tick = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe('CronProcessor: a run that must stop, stops', () => {
  it('lock lost (Redis restart): the old run is told to stop and the job ends at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const seen: { aborted?: boolean; threw?: string } = {};
    const { p, state, logger } = make(async () => {
      await gate;
      seen.aborted = currentJobSignal()?.aborted;
      try {
        throwIfJobStopped();
      } catch (e) {
        seen.threw = (e as Error).message;
      }
      return { done: true };
    });
    // A tiny TTL: the renewal (TTL / 3) runs within milliseconds.
    jest
      .spyOn(p as unknown as { lockTtlMs: () => number }, 'lockTtlMs')
      .mockReturnValue(30);
    const run = p.process('feed.reco');
    await tick(5);
    state.lose = true; // Redis lost the key
    const result = await run;
    expect(result).toEqual({ stopped: 'lock lost' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'cron_lock_lost', job: 'feed.reco' }),
      'cron job stopped: lock lost',
    );
    // The old run wakes up later: it sees the stop and does nothing more.
    release();
    await tick(5);
    expect(seen.aborted).toBe(true);
    expect(seen.threw).toMatch(/lock lost/);
  });

  it("BullMQ's own signal (lockRenewalFailed → cancelJob) stops the run too", async () => {
    const { p } = make(() => new Promise(() => undefined)); // hangs forever
    const outer = new AbortController();
    const run = p.process('feed.reco', outer.signal);
    await tick(2);
    outer.abort('lock lost');
    await expect(run).resolves.toEqual({ stopped: 'lock lost' });
  });

  it('time limit: a hung run fails with a clear error and frees its lane', async () => {
    const { p, hash } = make(() => new Promise(() => undefined));
    hash.set(
      'feed.reco',
      JSON.stringify({ firstAt: 1, lastOkAt: 2, okMs: [5] }),
    );
    // on + fixed list → the limit is the listed minutes; scaled down here.
    jest
      .spyOn(p as unknown as { timeLimit: () => Promise<number> }, 'timeLimit')
      .mockResolvedValue(20);
    await expect(p.process('feed.reco')).rejects.toThrow(/time limit/);
  });

  it('auto mode never limits a job before its first good run', async () => {
    const { p } = make(() => Promise.resolve({ ok: 1 }));
    const limit = await (
      p as unknown as { timeLimit: (n: string) => Promise<number | null> }
    ).timeLimit('feed.reco');
    expect(limit).toBeNull();
  });

  it('auto mode: 10 × the longest recent good run, at least the floor', async () => {
    const { p, hash } = make(() => Promise.resolve(null));
    hash.set(
      'feed.reco',
      JSON.stringify({ firstAt: 1, okMs: [8 * 60_000, 9 * 60_000] }),
    );
    const t = p as unknown as {
      timeLimit: (n: string) => Promise<number | null>;
    };
    expect(await t.timeLimit('feed.reco')).toBe(90 * 60_000);
    hash.set('feed.reco', JSON.stringify({ firstAt: 1, okMs: [1000] }));
    expect(await t.timeLimit('feed.reco')).toBe(60 * 60_000);
  });

  it('off mode: no limit at all', async () => {
    const { p, hash } = make(() => Promise.resolve(null), {
      values: { 'ops.cron_timeout_mode': 'off' },
    });
    hash.set('feed.reco', JSON.stringify({ firstAt: 1, okMs: [1000] }));
    const t = p as unknown as {
      timeLimit: (n: string) => Promise<number | null>;
    };
    expect(await t.timeLimit('feed.reco')).toBeNull();
  });
});

describe('CronProcessor: last good run per job', () => {
  it('a good run is recorded with its time; a skip because the previous run is still going is not', async () => {
    const { p, hash, kv } = make(() => Promise.resolve({ ok: 1 }));
    await p.process('legal.exports');
    const rec = JSON.parse(hash.get('legal.exports')!) as {
      firstAt: number;
      lastOkAt: number;
      okMs: number[];
    };
    expect(rec.lastOkAt).toBeGreaterThan(0);
    expect(rec.okMs).toHaveLength(1);
    // the previous run holds the lock
    kv.set('lock:job:cron:legal.exports', 'someone-else');
    await expect(p.process('legal.exports')).resolves.toEqual({
      skipped: 'previous run still active',
    });
    const after = JSON.parse(hash.get('legal.exports')!) as {
      lastOkAt: number;
    };
    expect(after.lastOkAt).toBe(rec.lastOkAt);
    expect(CRON_RUNS_KEY).toBe('ops:cron:runs');
  });

  it('a failed run is not a good run, but its first attempt is remembered', async () => {
    const { p, hash } = make(() => Promise.reject(new Error('boom')));
    await expect(p.process('legal.exports')).rejects.toThrow('boom');
    const rec = JSON.parse(hash.get('legal.exports')!) as {
      firstAt: number;
      lastOkAt?: number;
    };
    expect(rec.firstAt).toBeGreaterThan(0);
    expect(rec.lastOkAt).toBeUndefined();
  });
});

describe('CronProcessor: skips of frequent jobs are logged', () => {
  it('first skip, every N-th of the streak, and the run after it', async () => {
    const { p, kv, logger } = make(() => Promise.resolve({ ok: 1 }));
    kv.set('lock:job:cron:legal.exports', 'held');
    for (let i = 0; i < 4; i++) await p.process('legal.exports');
    const skips = logger.warn.mock.calls.filter(
      (c) => (c[0] as { metric?: string }).metric === 'cron_skipped',
    );
    // skip 1 and skip 3 (ops.cron_skip_log_every = 3)
    expect(skips.map((c) => (c[0] as { streak: number }).streak)).toEqual([
      1, 3,
    ]);
    expect(skips[0][0]).toEqual(
      expect.objectContaining({
        job: 'legal.exports',
        reason: 'previous run still active',
      }),
    );
    kv.delete('lock:job:cron:legal.exports');
    await p.process('legal.exports');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'cron_resumed',
        job: 'legal.exports',
        skipped: 4,
      }),
      'cron job runs again after skips',
    );
  });

  it('an hourly-or-slower job is not logged here (the runner logs every run of it)', async () => {
    const { p, kv, logger } = make(() => Promise.resolve({ ok: 1 }));
    kv.set('lock:job:cron:sessions.cleanup', 'held');
    await p.process('sessions.cleanup');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
