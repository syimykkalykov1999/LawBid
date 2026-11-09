import {
  decideHa,
  HA_FLIP_MS,
  HaAutoService,
  wantedHa,
  type HaFacts,
} from './ha-auto.service';

const NOW = 1_800_000_000_000;
const hours = (n: number, v: number | null): (number | null)[] =>
  Array.from({ length: n }, () => v);
const base: HaFacts = {
  mode: 'auto',
  threshold: 200,
  online: hours(168, 300),
  nowMs: NOW,
  db: { multiAz: false, available: true, pending: false },
  redis: { replicas: 0, failover: false, available: true },
  last: {},
};
const quiet: HaFacts = { ...base, online: hours(168, 10) };
const full = {
  db: { multiAz: true, available: true, pending: false },
  redis: { replicas: 1, failover: true, available: true },
};

describe('decideHa: adding copies', () => {
  it('adds both after 3 busy hours', () => {
    expect(decideHa(base)).toEqual(['db_multi_az_on', 'redis_replica_up']);
  });

  it('does nothing when off, threshold 0, short of data or one hour calm', () => {
    expect(decideHa({ ...base, mode: 'off' })).toEqual([]);
    expect(decideHa({ ...base, threshold: 0 })).toEqual([]);
    expect(wantedHa({ ...base, online: [300, 300] })).toBeNull();
    expect(wantedHa({ ...base, online: [300, 150, 300] })).toBeNull();
    expect(wantedHa({ ...base, online: [300, null, 300] })).toBeNull();
  });

  it('waits while AWS is busy with the resource', () => {
    expect(
      decideHa({
        ...base,
        db: { multiAz: false, available: true, pending: true },
        redis: { replicas: 0, failover: false, available: false },
      }),
    ).toEqual([]);
  });

  it('redis: replica first, failover on the next pass, then nothing', () => {
    const r = (replicas: number, failover: boolean): HaFacts => ({
      ...base,
      db: full.db,
      redis: { replicas, failover, available: true },
    });
    expect(decideHa(r(0, false))).toEqual(['redis_replica_up']);
    expect(decideHa(r(1, false))).toEqual(['redis_failover_on']);
    expect(decideHa(r(1, true))).toEqual([]);
  });

  it('mode on keeps the copies regardless of load', () => {
    expect(decideHa({ ...quiet, mode: 'on' })).toEqual([
      'db_multi_az_on',
      'redis_replica_up',
    ]);
  });

  it('never acts without the AWS names', () => {
    expect(decideHa({ ...base, db: null, redis: null })).toEqual([]);
  });
});

describe('decideHa: removing copies', () => {
  const q: HaFacts = { ...quiet, ...full };

  it('removes after a quiet week: db now, redis failover first then replica', () => {
    expect(decideHa(q)).toEqual(['db_multi_az_off', 'redis_failover_off']);
    expect(
      decideHa({
        ...q,
        db: { multiAz: false, available: true, pending: false },
        redis: { replicas: 1, failover: false, available: true },
      }),
    ).toEqual(['redis_replica_down']);
  });

  it('stays when a single hour was above half the threshold', () => {
    const online = hours(168, 10);
    online[100] = 150;
    expect(wantedHa({ ...q, online })).toBeNull();
  });

  it('never removes on a missing metric', () => {
    expect(wantedHa({ ...q, online: hours(168, null) })).toBeNull();
    const patchy = hours(168, 10);
    for (let i = 0; i < 30; i++) patchy[i] = null;
    expect(wantedHa({ ...q, online: patchy })).toBeNull();
    // 10 % holes are tolerated
    const ok = hours(168, 10);
    for (let i = 0; i < 10; i++) ok[i] = null;
    expect(wantedHa({ ...q, online: ok })).toBe('down');
  });

  it('mode on never removes', () => {
    expect(decideHa({ ...q, mode: 'on' })).toEqual([]);
  });
});

describe('decideHa: busy database or Redis (automation audit 2026-11-08)', () => {
  it('adds the copies when the database is busy, whatever the online count', () => {
    expect(
      decideHa({ ...quiet, pressure: { db: true, redis: false } }),
    ).toEqual(['db_multi_az_on', 'redis_replica_up']);
    expect(wantedHa({ ...quiet, pressure: { db: false, redis: true } })).toBe(
      'up',
    );
  });

  it('never removes the copies while busy, and is inert when off', () => {
    const busy: HaFacts = {
      ...quiet,
      ...full,
      pressure: { db: true, redis: false },
    };
    expect(decideHa(busy)).toEqual([]);
    expect(decideHa({ ...busy, mode: 'off' })).toEqual([]);
  });

  it('does not wait 24 h after a removal: an overload beats one flip', () => {
    expect(
      decideHa({
        ...quiet,
        pressure: { db: true, redis: true },
        last: {
          db: { dir: 'down', atMs: NOW - 3600_000 },
          redis: { dir: 'down', atMs: NOW - 3600_000 },
        },
      }),
    ).toEqual(['db_multi_az_on', 'redis_replica_up']);
  });
});

describe('decideHa: hysteresis', () => {
  it('the opposite direction waits 24 h after the last step', () => {
    const q: HaFacts = { ...quiet, ...full };
    const recent = { dir: 'up' as const, atMs: NOW - HA_FLIP_MS + 60_000 };
    expect(decideHa({ ...q, last: { db: recent, redis: recent } })).toEqual([]);
    const old = { dir: 'up' as const, atMs: NOW - HA_FLIP_MS - 60_000 };
    expect(decideHa({ ...q, last: { db: old, redis: old } })).toEqual([
      'db_multi_az_off',
      'redis_failover_off',
    ]);
  });

  it('the same direction continues at once (second Redis step)', () => {
    const l = { dir: 'down' as const, atMs: NOW - 600_000 };
    expect(
      decideHa({
        ...quiet,
        db: full.db,
        redis: { replicas: 1, failover: false, available: true },
        last: { redis: l },
      }),
    ).toEqual(['db_multi_az_off', 'redis_replica_down']);
  });
});

describe('decideHa: finishing a started sequence', () => {
  it('adds failover after the replica even if the load drifted', () => {
    const l = { dir: 'up' as const, atMs: NOW - 600_000 };
    const middling: HaFacts = {
      ...base,
      online: hours(168, 150), // between half the threshold and the threshold
      db: full.db,
      redis: { replicas: 1, failover: false, available: true },
      last: { redis: l },
    };
    expect(wantedHa(middling)).toBeNull();
    expect(decideHa(middling)).toEqual(['redis_failover_on']);
  });

  it('does not finish it a day later or with the mode off', () => {
    const old = { dir: 'up' as const, atMs: NOW - HA_FLIP_MS - 1 };
    const f: HaFacts = {
      ...base,
      online: hours(168, 150),
      db: full.db,
      redis: { replicas: 1, failover: false, available: true },
      last: { redis: old },
    };
    expect(decideHa(f)).toEqual([]);
    expect(
      decideHa({ ...f, mode: 'off', last: { redis: { ...old, atMs: NOW } } }),
    ).toEqual([]);
  });
});

describe('HaAutoService', () => {
  it('is inert off AWS', async () => {
    const svc = new HaAutoService({ get: () => undefined } as never);
    svc.onModuleInit();
    await expect(svc.check()).resolves.toEqual([]);
  });
});
