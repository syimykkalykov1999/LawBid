import type { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { LaunchChecksService } from '../../common/ops/launch/launch-checks.service';
import type { OpsStateService } from '../../common/ops/ops-state.service';
import type { SecretRotationService } from '../../common/ops/secret-rotation.service';
import type { IncidentsService } from '../../common/ops/status/incidents.service';
import type { StatusProbesService } from '../../common/ops/status/status-probes.service';
import type { SentryIssuesClient } from './sentry-issues.client';
import {
  STAFF_SYSTEM_KEY,
  StaffTodaySystemService,
} from './staff-today-system.service';
import { SYSTEM_FRESH_SEC } from './staff-system-items.logic';

const NOW = new Date('2026-10-27T10:00:00Z');

function fakeSummary(
  initial: { data: unknown; computedAt: string } | null = null,
) {
  let stored = initial;
  const calls: string[] = [];
  const svc = {
    async get(k: string, compute: () => Promise<unknown>, fresh: number) {
      calls.push(`get:${k}:${fresh}`);
      if (stored) return stored;
      stored = { data: await compute(), computedAt: NOW.toISOString() };
      return stored;
    },
    async refresh(k: string, compute: () => Promise<unknown>) {
      calls.push(`refresh:${k}`);
      stored = { data: await compute(), computedAt: NOW.toISOString() };
      return stored;
    },
    peek(k: string) {
      calls.push(`peek:${k}`);
      return Promise.resolve(stored);
    },
  };
  return {
    svc: svc as unknown as AdminSummaryService,
    calls,
    stored: () => stored,
  };
}

const ops = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    cost: jest.fn().mockResolvedValue(null),
    capacity: jest.fn().mockResolvedValue(null),
    economyEvents: jest.fn().mockResolvedValue([]),
    isEconomyLimited: jest.fn().mockResolvedValue(false),
    isHeavyPaused: jest.fn().mockResolvedValue(false),
    scaleMode: jest.fn().mockResolvedValue(null),
    workerHeartbeat: jest
      .fn()
      .mockResolvedValue({ at: NOW.toISOString(), mode: 'worker' }),
    lastBackup: jest.fn().mockResolvedValue(null),
    bloat: jest.fn().mockResolvedValue(null),
    ...over,
  }) as unknown as OpsStateService;

const launch = (items: unknown[] = []) =>
  ({
    report: jest.fn().mockResolvedValue({ items }),
  }) as unknown as LaunchChecksService;

const settings = {
  number: jest.fn().mockResolvedValue(26),
} as unknown as AppSettingsService;

const sentry = (state = 'off') =>
  ({
    read: jest
      .fn()
      .mockResolvedValue({ state, unresolved: 0, newCount: 0, issues: [] }),
  }) as unknown as SentryIssuesClient;

describe('StaffTodaySystemService', () => {
  it('builds from the cached readings only and stores for ≥ 5 minutes', async () => {
    const sum = fakeSummary();
    const svc = new StaffTodaySystemService(
      sum.svc,
      ops({
        cost: jest.fn().mockResolvedValue({
          actualUsd: 250,
          forecastUsd: 260,
          limitUsd: 200,
          checkedAt: 'x',
        }),
        capacity: jest.fn().mockResolvedValue({
          at: 'x',
          dbClass: 'db.r7g.16xlarge',
          redisClass: null,
          dbCpuPercent: 70,
          dbConnections: null,
          dbMaxConnections: null,
          redisMemoryPercent: null,
        }),
      }),
      launch([
        {
          id: 'dns',
          status: 'red',
          title: 'Домен',
          hint: 'NS',
          manualTick: false,
          ticked: false,
        },
      ]),
      settings,
      sentry('ok'),
      {
        extra: jest
          .fn()
          .mockResolvedValue([{ key: 'push', status: 'yellow', detail: {} }]),
      } as unknown as StatusProbesService,
      {
        recent: jest
          .fn()
          .mockResolvedValue([
            { component: 'queues', openedAt: NOW, closedAt: null },
          ]),
      } as unknown as IncidentsService,
      {
        enabled: true,
        rows: jest.fn().mockResolvedValue([{ name: 'db', state: 'overdue' }]),
      } as unknown as SecretRotationService,
    );
    const r = await svc.read(NOW);
    expect(sum.calls).toEqual([`get:${STAFF_SYSTEM_KEY}:${SYSTEM_FRESH_SEC}`]);
    expect(r.freshSec).toBeGreaterThanOrEqual(300);
    expect(r.items.map((i) => i.code)).toEqual([
      'cost_over',
      'incident_queues',
      'launch_dns',
      'db_cpu',
      'db_split_ready',
      'health_push',
      'rotation_overdue',
    ]);
    expect(r.counts).toEqual({ critical: 2, high: 1, medium: 4, low: 0 });
    expect(r.sentry.state).toBe('ok');
  });

  it('a stored block is served as is; Sentry is read at request time', async () => {
    const stored = {
      data: {
        computedAt: 'old',
        freshSec: 300,
        items: [],
        counts: { critical: 0, high: 0, medium: 0, low: 0 },
      },
      computedAt: '2026-10-27T09:59:00Z',
    };
    const sum = fakeSummary(stored);
    const o = ops();
    const svc = new StaffTodaySystemService(
      sum.svc,
      o,
      launch(),
      settings,
      sentry('unconfigured'),
    );
    const r = await svc.read();
    expect(r.computedAt).toBe('2026-10-27T09:59:00Z');
    expect(r.sentry.state).toBe('unconfigured');
    expect((o.cost as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('refreshIfStale: fresh → null and no sources read; stale → recount', async () => {
    const fresh = fakeSummary({
      data: { items: [], counts: { critical: 0, high: 0, medium: 0, low: 0 } },
      computedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const o1 = ops();
    expect(
      await new StaffTodaySystemService(
        fresh.svc,
        o1,
        launch(),
        settings,
        sentry(),
      ).refreshIfStale(NOW),
    ).toBeNull();
    expect((o1.cost as jest.Mock).mock.calls).toHaveLength(0);

    const stale = fakeSummary({
      data: { items: [], counts: { critical: 0, high: 0, medium: 0, low: 0 } },
      computedAt: new Date(
        NOW.getTime() - (SYSTEM_FRESH_SEC + 1) * 1000,
      ).toISOString(),
    });
    const o2 = ops({ workerHeartbeat: jest.fn().mockResolvedValue(null) });
    const r = await new StaffTodaySystemService(
      stale.svc,
      o2,
      launch(),
      settings,
      sentry(),
    ).refreshIfStale(NOW);
    expect(r?.items.map((i) => i.code)).toEqual(['worker_down']);
    expect(stale.calls).toEqual([
      `peek:${STAFF_SYSTEM_KEY}`,
      `refresh:${STAFF_SYSTEM_KEY}`,
    ]);
  });

  it('a failing source is simply absent, never an error', async () => {
    const sum = fakeSummary();
    const svc = new StaffTodaySystemService(
      sum.svc,
      ops({
        cost: jest.fn().mockRejectedValue(new Error('redis down')),
        lastBackup: jest
          .fn()
          .mockResolvedValue({ at: '2026-10-24T10:00:00Z', checkedAt: 'x' }),
      }),
      {
        report: jest.fn().mockRejectedValue(new Error('aws')),
      } as unknown as LaunchChecksService,
      settings,
      sentry(),
    );
    const r = await svc.build(NOW);
    expect(r.items.map((i) => `${i.severity}:${i.code}`)).toEqual([
      'critical:backup_old',
    ]);
  });
});
