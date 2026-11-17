import {
  decideHa,
  haMoneyHold,
  HA_FLIP_MS,
  HA_USD_MONTH,
  HaAutoService,
  wantedHa,
  haWindow,
  shardHaSteps,
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

describe('G10: the copies have their own money check', () => {
  it('economy limited: nothing is added in Авто, removing still works', () => {
    const money = { limited: true, budgetLeftUsd: 500 };
    expect(decideHa({ ...base, money })).toEqual([]);
    expect(haMoneyHold({ ...base, money })).toContain('limited');
    expect(decideHa({ ...quiet, ...full, money })).toEqual([
      'db_multi_az_off',
      'redis_failover_off',
    ]);
  });

  it('AWS budget left below their monthly cost: held; enough left: added', () => {
    expect(
      decideHa({
        ...base,
        money: { limited: false, budgetLeftUsd: HA_USD_MONTH - 1 },
      }),
    ).toEqual([]);
    expect(
      decideHa({ ...base, money: { limited: false, budgetLeftUsd: 100 } }),
    ).toEqual(['db_multi_az_on', 'redis_replica_up']);
    // unknown budget never blocks
    expect(
      decideHa({ ...base, money: { limited: false, budgetLeftUsd: null } }),
    ).toEqual(['db_multi_az_on', 'redis_replica_up']);
  });

  it("«Вкл» is the owner's choice: money does not hold it", () => {
    expect(
      decideHa({
        ...base,
        mode: 'on',
        money: { limited: true, budgetLeftUsd: 0 },
      }),
    ).toEqual(['db_multi_az_on', 'redis_replica_up']);
  });
});

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

describe('owner 2026-11-09: money holds the copies only with a sum he typed', () => {
  const money = (cap: number) => {
    const ops = {
      economy: jest.fn(() => Promise.resolve({ guard: 'limited' })),
      cost: jest.fn(() =>
        Promise.resolve({ limitUsd: 450, forecastUsd: 449, actualUsd: 100 }),
      ),
    };
    const settings = { number: jest.fn(() => Promise.resolve(cap)) };
    const svc = new HaAutoService(
      { get: () => undefined } as never,
      undefined,
      settings as never,
      ops as never,
    );
    return (svc as unknown as { money(): Promise<unknown> }).money();
  };

  it('no sum (0): no money facts, so nothing holds the copies back', async () => {
    expect(await money(0)).toBeUndefined();
  });

  it('a sum typed: the economy and AWS budget readings count again', async () => {
    expect(await money(300)).toEqual({ limited: true, budgetLeftUsd: 1 });
  });
});

/** Owner 14.11: the copies' waits in minutes for live tests (defaults kept). */
describe('decideHa: waits from the admin', () => {
  const q: HaFacts = { ...quiet, ...full };

  it('the flip guard is a setting: 10 minutes after a step the other way is allowed', () => {
    const tenAgo = { dir: 'up' as const, atMs: NOW - 11 * 60_000 };
    expect(decideHa({ ...q, last: { db: tenAgo, redis: tenAgo } })).toEqual([]);
    expect(
      decideHa({
        ...q,
        flipMs: 10 * 60_000,
        last: { db: tenAgo, redis: tenAgo },
      }),
    ).toEqual(['db_multi_az_off', 'redis_failover_off']);
  });

  it('a one-hour quiet window (ha.release_minutes) is enough when set', () => {
    expect(decideHa({ ...q, online: hours(1, 10) })).toEqual([]); // today: > 3 hours needed
    expect(decideHa({ ...q, online: hours(1, 10), minQuietHours: 1 })).toEqual([
      'db_multi_az_off',
      'redis_failover_off',
    ]);
  });

  it('windows: minute points up to one day, else full hours (0 = default)', () => {
    expect(haWindow(7 * 24 * 60, 0)).toEqual({ points: 168, periodS: 3600 });
    expect(haWindow(7 * 24 * 60, 10)).toEqual({ points: 10, periodS: 60 });
    expect(haWindow(180, 0)).toEqual({ points: 3, periodS: 3600 });
    expect(haWindow(180, 5)).toEqual({ points: 5, periodS: 60 });
    expect(haWindow(180, 1440)).toEqual({ points: 1440, periodS: 60 });
    expect(haWindow(180, 1500)).toEqual({ points: 25, periodS: 3600 });
  });
});

/** 15.11: «Авто» of the copies testable on prod within 10 minutes. */
describe('decideHa: busy window in minutes (ha.provision_minutes)', () => {
  const calm = hours(168, 0);
  it('5 busy minutes add both copies; one quiet minute does not', () => {
    const f: HaFacts = { ...base, threshold: 1, online: calm };
    expect(decideHa({ ...f, onlineUp: [1, 1, 2, 1, 1] })).toEqual([
      'db_multi_az_on',
      'redis_replica_up',
    ]);
    expect(decideHa({ ...f, onlineUp: [1, 1, 0, 1, 1] })).toEqual([]);
  });

  it('needs data for 90 % of the minutes; no data or an empty window = nothing', () => {
    const f: HaFacts = { ...base, threshold: 1, online: calm };
    const ten = Array.from({ length: 10 }, () => 3);
    expect(decideHa({ ...f, onlineUp: [...ten.slice(1), null] })).toEqual([
      'db_multi_az_on',
      'redis_replica_up',
    ]);
    expect(decideHa({ ...f, onlineUp: [...ten.slice(2), null, null] })).toEqual(
      [],
    );
    expect(decideHa({ ...f, onlineUp: [] })).toEqual([]);
  });

  it('the hourly default is unchanged: 3 full hours, every one with data', () => {
    expect(wantedHa({ ...base, onlineUp: [300, 300, 300] })).toBe('up');
    const between = hours(168, 150);
    expect(
      wantedHa({ ...base, online: between, onlineUp: [300, null, 300] }),
    ).toBe(null);
  });

  it('a short quiet window no longer blocks the busy check (was: 1 point, 3 needed)', () => {
    // Before 15.11 ha.release_minutes = 10 shrank the one series to 1 hour
    // and «add» needed its last 3 hours: the copies could never be added.
    const f: HaFacts = {
      ...base,
      threshold: 1,
      online: Array.from({ length: 10 }, () => 2),
      minQuietHours: 10,
      onlineUp: Array.from({ length: 5 }, () => 2),
    };
    expect(decideHa(f)).toEqual(['db_multi_az_on', 'redis_replica_up']);
  });

  it('ten quiet minutes remove the copies (minute release window)', () => {
    const f: HaFacts = {
      ...base,
      ...full,
      threshold: 200,
      online: Array.from({ length: 10 }, () => 0),
      minQuietHours: 10,
      onlineUp: Array.from({ length: 5 }, () => 0),
    };
    expect(decideHa(f)).toEqual(['db_multi_az_off', 'redis_failover_off']);
  });
});

/** 15.11: one pass on minute settings reads minute points and acts. */
describe('HaAutoService: live test on minute settings', () => {
  const NOW_MS = Date.UTC(2026, 10, 15, 14, 7, 30);
  const setup = (online: number) => {
    const vals: Record<string, number | string> = {
      'ha.mode': 'auto',
      'ha.provision_online_users': 1,
      'ha.provision_minutes': 5,
      'ha.release_days': 7,
      'ha.release_minutes': 10,
      'ha.flip_guard_minutes': 1,
      'infra.auto_check_minutes': 1,
      'economy.aws_cap_usd': 0,
    };
    const settings = {
      number: jest.fn((k: string) => Promise.resolve(Number(vals[k] ?? 0))),
      string: jest.fn((k: string) => Promise.resolve(String(vals[k] ?? ''))),
    };
    const redis = {
      set: jest.fn(() => Promise.resolve('OK')),
      get: jest.fn(() => Promise.resolve(null)),
    };
    const env: Record<string, string> = {
      OPS_DB_INSTANCE: 'db1',
      OPS_REDIS_GROUP: 'rg1',
    };
    const svc = new HaAutoService(
      { get: (k: string) => env[k] } as never,
      redis as never,
      settings as never,
    );
    const cwCalls: { Period?: number; StartTime?: Date; EndTime?: Date }[] = [];
    const cw = {
      send: jest.fn((cmd: { input: Record<string, unknown> }) => {
        const i = cmd.input as {
          Period: number;
          StartTime: Date;
          EndTime: Date;
          MetricName: string;
        };
        if (i.MetricName !== 'OpenSockets') {
          return Promise.resolve({ Datapoints: [] });
        }
        cwCalls.push(i);
        const pts = [];
        for (
          let t = i.StartTime.getTime();
          t < i.EndTime.getTime();
          t += i.Period * 1000
        ) {
          pts.push({ Timestamp: new Date(t), Sum: online * (i.Period / 60) });
        }
        return Promise.resolve({ Datapoints: pts });
      }),
    };
    const sent: string[] = [];
    const aws = (facts: unknown) => ({
      send: jest.fn((cmd: object) => {
        const n = cmd.constructor.name;
        if (n.startsWith('Describe')) return Promise.resolve(facts);
        sent.push(n);
        return Promise.resolve({});
      }),
    });
    Object.assign(svc as object, {
      cw,
      rds: aws({
        DBInstances: [{ MultiAZ: false, DBInstanceStatus: 'available' }],
      }),
      cache: aws({
        ReplicationGroups: [
          {
            NodeGroups: [{}],
            MemberClusters: ['rg1-001'],
            AutomaticFailover: 'disabled',
            Status: 'available',
          },
        ],
      }),
    });
    return { svc, cwCalls, sent, redis };
  };

  beforeEach(() =>
    jest.useFakeTimers({ now: NOW_MS, doNotFake: ['nextTick'] }),
  );
  afterEach(() => jest.useRealTimers());

  it('one person online for 5 minutes adds both copies in one pass', async () => {
    const { svc, cwCalls, sent, redis } = setup(1);
    await expect(svc.check()).resolves.toEqual([
      'db_multi_az_on',
      'redis_replica_up',
    ]);
    expect(sent).toEqual([
      'ModifyDBInstanceCommand',
      'IncreaseReplicaCountCommand',
    ]);
    const spans = cwCalls.map(
      (c) =>
        `${c.Period}:${(c.EndTime!.getTime() - c.StartTime!.getTime()) / 60_000}`,
    );
    expect(spans.sort()).toEqual(['60:10', '60:5']);
    // The newest 2 minutes are skipped (CloudWatch still filling them).
    expect(cwCalls[0].EndTime!.getTime()).toBe(Date.UTC(2026, 10, 15, 14, 5));
    // The pass lock follows infra.auto_check_minutes (1 min -> 30 s).
    expect(redis.set).toHaveBeenCalledWith(
      'ops:ha-auto:lock',
      '1',
      'EX',
      30,
      'NX',
    );
  });

  it('nobody online for 10 minutes: nothing is added', async () => {
    const { svc, sent } = setup(0);
    await expect(svc.check()).resolves.toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('row 203: the extra database servers follow the primary Multi-AZ', () => {
  const shard = (id: string, multiAz: boolean, extra: object = {}) => ({
    id,
    multiAz,
    available: true,
    pending: false,
    ...extra,
  });

  it('turning the primary on turns every single-zone server on', () => {
    expect(
      shardHaSteps(
        base,
        ['db_multi_az_on'],
        [shard('s1', false), shard('s2', true)],
      ),
    ).toEqual([{ id: 's1', multiAz: true }]);
  });

  it('a primary already on brings a server created single-zone in line', () => {
    expect(
      shardHaSteps({ ...base, ...full }, [], [shard('s1', false)]),
    ).toEqual([{ id: 's1', multiAz: true }]);
  });

  it('turning the primary off turns the servers off', () => {
    expect(
      shardHaSteps(
        { ...quiet, ...full },
        ['db_multi_az_off'],
        [shard('s1', true)],
      ),
    ).toEqual([{ id: 's1', multiAz: false }]);
  });

  it('mode off, no primary facts, or a busy server: nothing', () => {
    const s = [shard('s1', false)];
    expect(
      shardHaSteps({ ...base, mode: 'off' }, ['db_multi_az_on'], s),
    ).toEqual([]);
    expect(shardHaSteps({ ...base, db: null }, ['db_multi_az_on'], s)).toEqual(
      [],
    );
    expect(
      shardHaSteps(
        base,
        ['db_multi_az_on'],
        [
          shard('s1', false, { available: false }),
          shard('s2', false, { pending: true }),
        ],
      ),
    ).toEqual([]);
  });

  it('money holds adding in Авто, never removing', () => {
    const money = { limited: true, budgetLeftUsd: null };
    expect(
      shardHaSteps({ ...base, ...full, money }, [], [shard('s1', false)]),
    ).toEqual([]);
    expect(
      shardHaSteps(
        { ...quiet, ...full, money },
        ['db_multi_az_off'],
        [shard('s1', true)],
      ),
    ).toEqual([{ id: 's1', multiAz: false }]);
  });

  it('service: the primary and its extra servers get Multi-AZ in one pass', async () => {
    const vals: Record<string, number | string> = {
      'ha.mode': 'on',
      'infra.auto_check_minutes': 10,
    };
    const settings = {
      number: jest.fn((k: string) => Promise.resolve(Number(vals[k] ?? 0))),
      string: jest.fn((k: string) => Promise.resolve(String(vals[k] ?? ''))),
    };
    const redis = {
      set: jest.fn(() => Promise.resolve('OK')),
      get: jest.fn(() => Promise.resolve(null)),
    };
    const env: Record<string, string> = {
      OPS_DB_INSTANCE: 'p',
      OPS_DB_SHARD_INSTANCES: 'p-db1, p-db2,missing',
    };
    const svc = new HaAutoService(
      { get: (k: string) => env[k] } as never,
      redis as never,
      settings as never,
    );
    const multi: Record<string, boolean> = {
      p: false,
      'p-db1': false,
      'p-db2': true,
    };
    const modified: [string, boolean][] = [];
    Object.assign(svc as object, {
      cw: { send: jest.fn(() => Promise.resolve({ Datapoints: [] })) },
      rds: {
        send: jest.fn(
          (cmd: {
            constructor: { name: string };
            input: Record<string, unknown>;
          }) => {
            const id = String(cmd.input.DBInstanceIdentifier);
            if (cmd.constructor.name === 'DescribeDBInstancesCommand') {
              if (!(id in multi)) {
                return Promise.reject(new Error('DBInstanceNotFound'));
              }
              return Promise.resolve({
                DBInstances: [
                  { MultiAZ: multi[id], DBInstanceStatus: 'available' },
                ],
              });
            }
            modified.push([id, Boolean(cmd.input.MultiAZ)]);
            return Promise.resolve({});
          },
        ),
      },
    });
    await expect(svc.check()).resolves.toEqual([
      'db_multi_az_on',
      'db_shard_multi_az_on',
    ]);
    expect(modified).toEqual([
      ['p', true],
      ['p-db1', true],
    ]);
    // Only the primary's step is remembered for the 24 h guard.
    const keys = redis.set.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(keys).toContain('ops:ha-auto:last:db');
    expect(keys.filter((k) => k.startsWith('ops:ha-auto:last:'))).toEqual([
      'ops:ha-auto:last:db',
    ]);
  });
});
