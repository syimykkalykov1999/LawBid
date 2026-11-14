import {
  DB_LOST_EXIT_LOCK,
  DB_OK_HASH,
  DbLostWatchdog,
} from './db-lost-watchdog.service';

/** Perf batch 2 (13.11, row 125): a task cut off from the database exits
 * so ECS replaces it — never during a database-wide outage. */
class FakeRedis {
  hash = new Map<string, string>();
  keys = new Map<string, string>();
  down = false;
  private guard() {
    if (this.down) throw new Error('redis down');
  }
  hset = jest.fn((_k: string, f: string, v: string) => {
    this.guard();
    this.hash.set(f, v);
    return Promise.resolve(1);
  });
  expire = jest.fn(() => Promise.resolve(1));
  hgetall = jest.fn(() => {
    this.guard();
    return Promise.resolve(Object.fromEntries(this.hash));
  });
  hdel = jest.fn((_k: string, f: string) => {
    this.hash.delete(f);
    return Promise.resolve(1);
  });
  set = jest.fn((k: string, v: string) => {
    this.guard();
    if (this.keys.has(k)) return Promise.resolve(null);
    this.keys.set(k, v);
    return Promise.resolve('OK');
  });
}

function make(opts: { exitMin?: number; jitterSec?: number } = {}) {
  let dbUp = true;
  const prisma = {
    $queryRaw: jest.fn(() =>
      dbUp
        ? Promise.resolve([{ '?column?': 1 }])
        : Promise.reject(new Error('x')),
    ),
  };
  const redis = new FakeRedis();
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'ops.db_lost_exit_min'
          ? (opts.exitMin ?? 10)
          : (opts.jitterSec ?? 0),
      ),
    ),
  };
  let clock = 1_000_000_000;
  const w = new DbLostWatchdog(
    prisma as never,
    redis as never,
    settings as never,
  );
  w.now = () => clock;
  w.random = () => 0;
  const exit = jest.fn();
  w.exit = exit;
  return {
    w,
    redis,
    exit,
    setDb: (up: boolean) => {
      dbUp = up;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    clock: () => clock,
  };
}

describe('DbLostWatchdog', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['Date'] }));
  afterEach(() => jest.useRealTimers());

  it('records its own answer while the database is up', async () => {
    const t = make();
    expect(await t.w.tick()).toBe('ok');
    expect(t.redis.hset).toHaveBeenCalledWith(
      DB_OK_HASH,
      expect.any(String),
      String(t.clock()),
    );
  });

  it('waits the admin number of minutes first', async () => {
    const t = make({ exitMin: 10 });
    await t.w.tick();
    t.setDb(false);
    t.advance(9 * 60_000);
    expect(await t.w.tick()).toBe('waiting');
    expect(t.exit).not.toHaveBeenCalled();
  });

  it('exits once, after the jitter, when another task reaches the database', async () => {
    const t = make({ exitMin: 10, jitterSec: 0 });
    await t.w.tick();
    t.setDb(false);
    t.advance(11 * 60_000);
    t.redis.hash.set('other-task:1', String(t.clock() - 20_000));
    expect(await t.w.tick()).toBe('exit');
    expect(t.redis.keys.has(DB_LOST_EXIT_LOCK)).toBe(true);
    jest.runOnlyPendingTimers();
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(await t.w.tick()).toBe('exit');
    jest.runOnlyPendingTimers();
    expect(t.exit).toHaveBeenCalledTimes(1);
  });

  it('a database-wide outage restarts nothing (no other task reached it lately)', async () => {
    const t = make({ exitMin: 10 });
    await t.w.tick(); // its own field, now old
    t.setDb(false);
    t.advance(30 * 60_000);
    t.redis.hash.set('other-task:1', String(t.clock() - 5 * 60_000));
    expect(await t.w.tick()).toBe('db_down_everywhere');
    jest.runOnlyPendingTimers();
    expect(t.exit).not.toHaveBeenCalled();
  });

  it('its own old field never counts as «another task is fine»', async () => {
    const t = make({ exitMin: 1 });
    await t.w.tick();
    t.setDb(false);
    t.advance(61_000);
    expect(await t.w.tick()).toBe('db_down_everywhere');
  });

  it('cannot tell (Redis away too) = stays', async () => {
    const t = make({ exitMin: 10 });
    await t.w.tick();
    t.setDb(false);
    t.advance(11 * 60_000);
    t.redis.down = true;
    expect(await t.w.tick()).toBe('unsure');
    jest.runOnlyPendingTimers();
    expect(t.exit).not.toHaveBeenCalled();
  });

  it('only one task of the fleet restarts per lock window', async () => {
    const t = make({ exitMin: 10 });
    await t.w.tick();
    t.setDb(false);
    t.advance(11 * 60_000);
    t.redis.hash.set('other-task:1', String(t.clock()));
    t.redis.keys.set(DB_LOST_EXIT_LOCK, 'third-task:1');
    expect(await t.w.tick()).toBe('locked');
    jest.runOnlyPendingTimers();
    expect(t.exit).not.toHaveBeenCalled();
  });

  it('0 minutes in the admin = never', async () => {
    const t = make({ exitMin: 0 });
    await t.w.tick();
    t.setDb(false);
    t.advance(120 * 60_000);
    t.redis.hash.set('other-task:1', String(t.clock()));
    expect(await t.w.tick()).toBe('off');
  });

  it('a short failover (database back within the window) resets the count', async () => {
    const t = make({ exitMin: 10 });
    await t.w.tick();
    t.setDb(false);
    t.advance(8 * 60_000);
    await t.w.tick();
    t.setDb(true);
    expect(await t.w.tick()).toBe('ok');
    t.setDb(false);
    t.advance(8 * 60_000);
    expect(await t.w.tick()).toBe('waiting');
  });
});
