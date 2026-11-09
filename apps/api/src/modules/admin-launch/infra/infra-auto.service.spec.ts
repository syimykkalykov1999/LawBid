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
    string: jest.fn(async (k: string) =>
      k === 'infra.auto_mode' ? (o.autoMode ?? 'auto') : 'off',
    ),
    number: jest.fn(async (k: string) =>
      k === 'infra.auto_on_minutes'
        ? 30
        : k === 'infra.auto_off_hours'
          ? 72
          : k === 'infra.auto_max_usd_month'
            ? 100
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
