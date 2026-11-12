/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { InfraAutoService } from './infra-auto.service';
import { SYSTEM_ACTOR_ID } from './infra-auto.logic';

/**
 * Automation audit 2026-11-08: dry run of the whole automatic pass with
 * fakes: a signal that held long enough starts the change request by
 * itself (as the system), a short one does not, the money ceiling and a
 * missing GitHub App hold it back with a message instead of silence.
 */
function make(
  o: {
    pressures?: string[];
    budgetRatio?: number | null;
    /** economy.aws_cap_usd; the older cases ran with a sum typed. */
    awsCap?: number;
    configured?: boolean;
    autoMode?: string;
    seen?: Record<string, number>;
  } = {},
) {
  const store = new Map<string, string>();
  if (o.seen) store.set('ops:infra-auto:seen', JSON.stringify(o.seen));
  const sets = new Map<string, Set<string>>();
  const redis = {
    set: jest.fn(async (k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    sadd: jest.fn(async (k: string, v: string) => {
      const s = sets.get(k) ?? new Set<string>();
      sets.set(k, s);
      if (s.has(v)) return 0;
      s.add(v);
      return 1;
    }),
    expire: jest.fn(async () => 1),
  };
  const infra = {
    guards: jest.fn(async () => ({
      dryRun: true,
      dailyCap: 3,
      quietHours: '',
      configured: o.configured ?? true,
      inQuietWindow: true,
    })),
    liveStates: jest.fn(async () => new Map()),
    create: jest.fn(async () => ({ id: 'req-1', status: 'requested' })),
  };
  const registry = {
    signals: jest.fn(async () => ({
      pressures: o.pressures ?? [],
      budgetRatio: o.budgetRatio === undefined ? 0.2 : o.budgetRatio,
    })),
    searchEngine: jest.fn(async () => 'postgres'),
  };
  const settings = {
    raw: jest.fn(async () => undefined),
    string: jest.fn(async (k: string) =>
      k === 'infra.auto_mode'
        ? (o.autoMode ?? 'auto')
        : k === 'db.replica_provision'
          ? 'auto'
          : 'off',
    ),
    number: jest.fn(async (k: string) =>
      k === 'infra.auto_on_minutes'
        ? 30
        : k === 'infra.auto_off_hours'
          ? 72
          : k === 'infra.auto_max_usd_month'
            ? 100
            : k === 'economy.aws_cap_usd'
              ? (o.awsCap ?? 450)
              : 50_000_000,
    ),
  };
  const prisma = {
    infraChangeRequest: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    $queryRaw: jest.fn(async () => []),
  };
  const config = { get: jest.fn(() => undefined) };
  const incidents = {
    recipients: jest.fn(async () => [
      { userId: 'owner-1', email: 'o@example.test', lang: 'ru' },
    ]),
  };
  const push = { enqueueOpsAlert: jest.fn(async () => undefined) };
  const svc = new InfraAutoService(
    infra as never,
    registry as never,
    settings as never,
    prisma as never,
    config as never,
    redis as never,
    incidents as never,
    push as never,
  );
  return { svc, infra, push, store, redis };
}

const T0 = new Date('2026-11-08T12:00:00Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

describe('InfraAutoService (dry run with fakes)', () => {
  it('a signal that held 30 minutes switches the item on by itself and tells the owner', async () => {
    const { svc, infra, push, store } = make({
      pressures: ['db_connections'],
    });
    expect((await svc.check(T0)).started).toBeNull();
    expect(infra.create).not.toHaveBeenCalled();
    store.delete('ops:infra-auto:lock');
    const r = await svc.check(later(31));
    expect(r.started).toMatchObject({ id: 'aws.pgbouncer', to: 'on' });
    expect(infra.create).toHaveBeenCalledWith(
      SYSTEM_ACTOR_ID,
      null,
      'aws.pgbouncer',
      'on',
      null,
      { auto: true },
    );
    expect(push.enqueueOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'owner-1', email: true }),
    );
  });

  it('one pass at a time across API tasks (Redis lock)', async () => {
    const { svc, infra } = make({
      pressures: ['db_connections'],
      seen: { 'aws.pgbouncer:on': T0.getTime() - 3600_000 },
    });
    await svc.check(T0);
    await svc.check(T0);
    expect(infra.create).toHaveBeenCalledTimes(1);
  });

  it('money ceiling: no switch-on at 90 % of the AWS budget, the owner is told once', async () => {
    const { svc, infra, push, store } = make({
      pressures: ['db_connections'],
      budgetRatio: 0.92,
      seen: { 'aws.pgbouncer:on': T0.getTime() - 3600_000 },
    });
    const r = await svc.check(T0);
    expect(infra.create).not.toHaveBeenCalled();
    expect(r.held[0].reason).toContain('90 %');
    store.delete('ops:infra-auto:lock');
    await svc.check(later(10));
    expect(push.enqueueOpsAlert).toHaveBeenCalledTimes(1);
  });

  it('owner 2026-11-09: no AWS money ceiling typed = money never holds a switch-on', async () => {
    const { svc, infra } = make({
      awsCap: 0,
      pressures: ['db_connections'],
      budgetRatio: 0.98,
      seen: { 'aws.pgbouncer:on': T0.getTime() - 3600_000 },
    });
    const r = await svc.check(T0);
    expect(r.started).toMatchObject({ id: 'aws.pgbouncer', to: 'on' });
    expect(infra.create).toHaveBeenCalled();
  });

  it('without the GitHub App it never silently skips: it says why', async () => {
    const { svc, infra } = make({
      pressures: ['db_cpu'],
      configured: false,
      seen: { 'aws.rds_replicas:on': T0.getTime() - 3600_000 },
    });
    const r = await svc.check(T0);
    expect(infra.create).not.toHaveBeenCalled();
    expect(r.held[0].reason).toContain('GitHub');
  });

  it('infra.auto_mode = off keeps everything a proposal', async () => {
    const { svc, infra } = make({
      pressures: ['db_connections'],
      autoMode: 'off',
      seen: { 'aws.pgbouncer:on': T0.getTime() - 3600_000 },
    });
    await svc.check(T0);
    expect(infra.create).not.toHaveBeenCalled();
  });
});

describe('InfraAutoService.searchPass: search.engine follows the engine («Авто»)', () => {
  function search(o: {
    follow?: string;
    mode?: string;
    domain?: 'on' | 'off';
    configured?: boolean;
    phase?: string | null;
    seen?: string;
  }) {
    const store = new Map<string, string>();
    if (o.seen) store.set('ops:infra-auto:search-seen', o.seen);
    const log: string[] = [];
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
      sadd: jest.fn(async () => 1),
      expire: jest.fn(async () => 1),
      keys: jest.fn(async () => []),
      incr: jest.fn(async () => 1),
      multi: jest.fn(() => {
        const m = {
          lpush: (_k: string, v: string) => (log.push(v), m),
          ltrim: () => m,
          exec: async () => [],
        };
        return m;
      }),
    };
    const settings = {
      raw: jest.fn(async () => undefined),
      string: jest.fn(async (k: string) =>
        k === 'search.engine_follow'
          ? (o.follow ?? 'auto')
          : k === 'search.engine'
            ? (o.mode ?? 'postgres')
            : 'auto',
      ),
      number: jest.fn(async () => 30),
    };
    const infra = {
      liveStates: jest.fn(
        async () => new Map([['aws.opensearch', o.domain ?? 'on']]),
      ),
    };
    const upsert = jest.fn(async () => ({}));
    const prisma = { appConfig: { upsert } };
    const reindex = {
      status: jest.fn(async () => ({
        engineConfigured: o.configured ?? true,
        state: o.phase ? { phase: o.phase } : null,
      })),
      start: jest.fn(async () => ({})),
      swap: jest.fn(async () => ({})),
    };
    const push = { enqueueOpsAlert: jest.fn(async () => undefined) };
    const incidents = {
      recipients: jest.fn(async () => [{ userId: 'owner-1' }]),
    };
    const moduleRef = { get: jest.fn(() => reindex) };
    const svc = new InfraAutoService(
      infra as never,
      {} as never,
      settings as never,
      prisma as never,
      { get: jest.fn() } as never,
      redis as never,
      incidents as never,
      push as never,
      moduleRef as never,
    );
    return { svc, upsert, reindex, push, log, store };
  }
  const T0 = new Date('2026-11-09T10:00:00Z');
  const later = new Date(T0.getTime() + 31 * 60_000);

  it('domain on: shadow only after the signal held 30 minutes, then logged and told', async () => {
    const a = search({});
    expect(await a.svc.searchPass(T0)).toBeNull();
    expect(a.upsert).not.toHaveBeenCalled();
    const b = search({ seen: a.store.get('ops:infra-auto:search-seen') });
    expect(await b.svc.searchPass(later)).toMatchObject({
      kind: 'set_mode',
      to: 'shadow',
    });
    expect(b.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 'shadow' } }),
    );
    expect(b.log).toHaveLength(1);
    expect(b.push.enqueueOpsAlert).toHaveBeenCalled();
  });

  it('shadow: starts the reindex, swaps when built, then engine', async () => {
    const seenOf = (k: string) => `${k}@${T0.getTime()}`;
    const r1 = search({ mode: 'shadow', seen: seenOf('search:start_reindex') });
    expect(await r1.svc.searchPass(later)).toMatchObject({
      kind: 'start_reindex',
    });
    expect(r1.reindex.start).toHaveBeenCalledWith('postgres');
    const r2 = search({
      mode: 'shadow',
      phase: 'built',
      seen: seenOf('search:swap'),
    });
    expect(await r2.svc.searchPass(later)).toMatchObject({ kind: 'swap' });
    expect(r2.reindex.swap).toHaveBeenCalled();
    const r3 = search({
      mode: 'shadow',
      phase: 'write_swapped',
      seen: seenOf('search:set_mode:engine'),
    });
    expect(await r3.svc.searchPass(later)).toMatchObject({ to: 'engine' });
  });

  it('domain off: back to postgres at once (no waiting)', async () => {
    const a = search({ mode: 'engine', domain: 'off' });
    expect(await a.svc.searchPass(T0)).toMatchObject({ to: 'postgres' });
    expect(a.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 'postgres' } }),
    );
  });

  it('manual: nothing is touched', async () => {
    const a = search({ follow: 'manual', mode: 'engine', domain: 'off' });
    expect(await a.svc.searchPass(later)).toBeNull();
    expect(a.upsert).not.toHaveBeenCalled();
  });

  it('a refused step (verification failed) is told once and retried later', async () => {
    const a = search({
      mode: 'shadow',
      phase: 'built',
      seen: `search:swap@${T0.getTime()}`,
    });
    a.reindex.swap.mockRejectedValueOnce(new Error('sample mismatch'));
    expect(await a.svc.searchPass(later)).toBeNull();
    expect(a.push.enqueueOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Поиск: автоматический шаг не прошёл' }),
    );
  });
});
