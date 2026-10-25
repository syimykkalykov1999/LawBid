/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { EconomyService } from './economy.service';
import type {
  EconomyEvent,
  EconomyState,
  ScaleMode,
  CeilingSnapshot,
  CapacityReading,
} from '../ops/ops.constants';

const NOW = new Date('2026-10-16T12:00:00Z');

interface Opts {
  flag?: boolean;
  revenueCents?: number;
  /** AWS Budgets actual spend so far this month (null = unreadable). */
  awsActual?: number | null;
  awsForecast?: number | null;
  smsMonth?: number;
  onAws?: boolean;
  scaleMode?: ScaleMode | null;
  running?: { api: number; worker: number };
  stored?: Record<string, unknown>;
  capacityMetrics?: Partial<CapacityReading>;
  mode?: 'auto' | 'manual';
}

function setup(o: Opts = {}) {
  let economy: EconomyState | null = null;
  let scaleMode: ScaleMode | null = o.scaleMode ?? null;
  let ceiling: CeilingSnapshot | null = null;
  let capacity: CapacityReading | null = null;
  const events: EconomyEvent[] = [];
  const flags = new Set<string>();
  const stored: Record<string, unknown> = { ...(o.stored ?? {}) };

  const ops = {
    economy: jest.fn(async () => economy),
    setEconomy: jest.fn(async (s: EconomyState | null) => {
      economy = s;
    }),
    scaleMode: jest.fn(async () => scaleMode),
    setScaleMode: jest.fn(async (m: ScaleMode) => {
      scaleMode = m;
    }),
    ceiling: jest.fn(async () => ceiling),
    setCeiling: jest.fn(async (c: CeilingSnapshot) => {
      ceiling = c;
    }),
    capacity: jest.fn(async () => capacity),
    setCapacity: jest.fn(async (c: CapacityReading) => {
      capacity = c;
    }),
    economyEvents: jest.fn(async () => events),
    pushEconomyEvent: jest.fn(async (e: EconomyEvent) => {
      events.unshift(e);
    }),
    firstTime: jest.fn(async (k: string) => {
      if (flags.has(k)) return false;
      flags.add(k);
      return true;
    }),
    cost: jest.fn(async () =>
      o.awsActual === null || o.awsActual === undefined
        ? null
        : {
            actualUsd: o.awsActual,
            forecastUsd: o.awsForecast ?? null,
            limitUsd: 200,
            checkedAt: NOW.toISOString(),
          },
    ),
  };

  const settingValues: Record<string, number | string> = {
    'economy.max_spend_percent': 50,
    'economy.min_threshold_usd': 150,
    'economy.ceiling_mode': o.mode ?? 'auto',
    'economy.manual_api_max': 6,
    'economy.manual_worker_max': 3,
    'economy.sms_unit_usd': 0.01,
    'economy.video_unit_usd': 0.05,
    'economy.translate_unit_usd': 0.002,
    'economy.aws_fallback_usd': 150,
  };
  const settings = {
    number: jest.fn(async (k: string) => settingValues[k] as number),
    string: jest.fn(async (k: string) => settingValues[k] as string),
  };

  const prisma = {
    payment: {
      aggregate: jest.fn(async () => ({
        _sum: { amount_cents: o.revenueCents ?? 0 },
      })),
    },
    appConfig: {
      upsert: jest.fn(
        async (a: { where: { key: string }; update: { value: unknown } }) => {
          stored[a.where.key] = a.update.value;
        },
      ),
      deleteMany: jest.fn(async (a: { where: { key: string } }) => {
        delete stored[a.where.key];
      }),
    },
  };
  const redis = { del: jest.fn(async () => 1) };
  const flagSvc = { isEnabled: jest.fn(async () => o.flag ?? true) };

  const aws = {
    available: o.onAws ?? true,
    minTasks: 1,
    hardCap: (k: string) => (k === 'api' ? 50 : 20),
    taskUsd: (k: string) => (k === 'api' ? 18 : 28),
    cost: jest.fn(async () => null),
    taskCounts: jest.fn(async () => ({
      api: { running: o.running?.api ?? 1, desired: 1 },
      worker: { running: o.running?.worker ?? 1, desired: 1 },
    })),
    ceilingsNow: jest.fn(async () => null),
    setScale: jest.fn(async () => undefined),
    setCeilings: jest.fn(async () => undefined),
  };
  const cap = {
    available: !!o.capacityMetrics,
    info: jest.fn(async () => ({
      dbClass: 'db.t4g.medium',
      redisClass: 'cache.t4g.micro',
    })),
    metrics: jest.fn(async () => ({
      dbCpuPercent: null,
      dbConnections: null,
      dbMaxConnections: null,
      redisMemoryPercent: null,
      ...o.capacityMetrics,
    })),
    increase: jest.fn(async () => ({
      from: 'db.t4g.medium',
      to: 'db.t4g.large',
    })),
    decrease: jest.fn(async () => ({
      from: 'db.t4g.medium',
      to: 'db.t4g.small',
    })),
    dbClass: jest.fn(async () => 'db.t4g.medium'),
    redisClass: jest.fn(async () => 'cache.t4g.small'),
  };

  const autoscale = {
    usage: jest.fn(async (p: string) => ({
      today: 0,
      month: p === 'sms' ? (o.smsMonth ?? 0) : 0,
    })),
    readSettings: jest.fn(async () => ({
      settings: new Proxy(
        {},
        {
          get: () =>
            new Proxy(
              {},
              { get: () => ({ mode: 'auto', floor: 100, ceiling: 1000 }) },
            ),
        },
      ),
      stored,
    })),
    effectiveCap: jest.fn(
      (st: Record<string, unknown>, p: string, w: string) => {
        const suffix =
          w === 'minute'
            ? 'per_minute_max'
            : w === 'daily'
              ? 'daily_max'
              : 'monthly_max';
        const v = st[`budget.${p}.${suffix}`];
        return typeof v === 'number' ? v : 5000;
      },
    ),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() };

  const svc = new EconomyService(
    prisma as never,
    redis as never,
    settings as never,
    flagSvc as never,
    aws as never,
    cap as never,
    ops as never,
    autoscale as never,
    logger as never,
  );
  return {
    svc,
    ops,
    aws,
    cap,
    prisma,
    logger,
    stored,
    events,
    state: () => economy,
    scale: () => scaleMode,
    ceiling: () => ceiling,
  };
}

describe('EconomyService.figures', () => {
  it('allows 50 % of revenue, never below the $150 threshold', async () => {
    const lowRevenue = await setup({ revenueCents: 10_000 }).svc.figures(NOW);
    expect(lowRevenue.revenue30dUsd).toBe(100);
    expect(lowRevenue.allowedUsd).toBe(150);
    const rich = await setup({ revenueCents: 1_000_000 }).svc.figures(NOW);
    expect(rich.allowedUsd).toBe(5000);
  });

  it('adds AWS (actual), SMS (units × price) into the projection', async () => {
    const f = await setup({
      awsActual: 80,
      awsForecast: 160,
      smsMonth: 1000,
    }).svc.figures(NOW);
    const aws = f.lines.find((l) => l.key === 'aws')!;
    const sms = f.lines.find((l) => l.key === 'sms')!;
    expect(aws).toMatchObject({
      monthToDateUsd: 80,
      projectedUsd: 160,
      source: 'actual',
    });
    // 1000 SMS × $0.01 = $10 in 16 days of 31 → $19.38 projected.
    expect(sms.monthToDateUsd).toBe(10);
    expect(sms.projectedUsd).toBeCloseTo(19.38, 1);
    expect(f.projectedUsd).toBeCloseTo(160 + 19.38, 1);
  });

  it('falls back to the configured AWS amount when Budgets is unreadable', async () => {
    const f = await setup({ awsActual: null }).svc.figures(NOW);
    expect(f.lines[0]).toMatchObject({
      key: 'aws',
      projectedUsd: 150,
      source: 'estimate',
    });
  });
});

describe('EconomyService.tick', () => {
  it('does nothing restrictive while spend is under the rule', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.state()).toBeNull();
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.logger.warn).not.toHaveBeenCalled();
  });

  it('switches the guard on above the rule: floors caps, scales to min, alerts', async () => {
    const t = setup({
      awsActual: 150,
      awsForecast: 400,
      stored: { 'budget.sms.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('limited');
    // The caps were cut to the floor (100) and remembered.
    expect(t.stored['budget.sms.daily_max']).toBe(100);
    expect(t.state()?.savedCaps['budget.sms.daily_max']).toEqual({
      before: 900,
      set: 100,
    });
    expect(t.aws.setScale).toHaveBeenCalledWith('min');
    expect(t.scale()).toMatchObject({ mode: 'min', source: 'economy' });
    expect(t.events.map((e) => e.kind)).toContain('guard_on');
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'economy_guard_on' }),
      expect.any(String),
    );
  });

  it('never raises a provider the owner switched off (cap 0)', async () => {
    const t = setup({
      awsActual: 150,
      awsForecast: 400,
      stored: { 'budget.video.daily_max': 0 },
    });
    await t.svc.tick(NOW);
    expect(t.stored['budget.video.daily_max']).toBe(0);
  });

  it('is idempotent: a second tick over the line changes nothing more', async () => {
    const t = setup({ awsActual: 150, awsForecast: 400 });
    await t.svc.tick(NOW);
    t.aws.setScale.mockClear();
    t.ops.pushEconomyEvent.mockClear();
    await t.svc.tick(NOW);
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.events.filter((e) => e.kind === 'guard_on')).toHaveLength(1);
  });

  it('releases below 90 % of the allowance and restores the caps', async () => {
    const t = setup({
      awsActual: 150,
      awsForecast: 400,
      stored: { 'budget.sms.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    // Spend drops: new setup values via the cost mock.
    t.ops.cost.mockResolvedValue({
      actualUsd: 60,
      forecastUsd: 100,
      limitUsd: 200,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('ok');
    expect(t.stored['budget.sms.daily_max']).toBe(900);
    expect(t.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['guard_on', 'guard_off']),
    );
    // The ceiling is the rule's again, not the minimum.
    expect(t.aws.setCeilings).toHaveBeenCalled();
    expect(t.scale()).toMatchObject({ mode: 'normal', source: 'economy' });
  });

  it('keeps hysteresis: still limited between 90 % and 100 %', async () => {
    const t = setup({ awsActual: 150, awsForecast: 400 });
    await t.svc.tick(NOW);
    t.ops.cost.mockResolvedValue({
      actualUsd: 100,
      forecastUsd: 145, // 96 % of $150
      limitUsd: 200,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('limited');
  });

  it('does not overwrite a cap an admin edited during the guard', async () => {
    const t = setup({
      awsActual: 150,
      awsForecast: 400,
      stored: { 'budget.sms.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    t.stored['budget.sms.daily_max'] = 250; // the admin's edit
    t.ops.cost.mockResolvedValue({
      actualUsd: 60,
      forecastUsd: 100,
      limitUsd: 200,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.stored['budget.sms.daily_max']).toBe(250);
  });

  it('flag off: releases a running guard and acts no more', async () => {
    const on = setup({ awsActual: 150, awsForecast: 400 });
    await on.svc.tick(NOW);
    // Same instance, flag now off.
    (on.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    const res = await on.svc.tick(NOW);
    expect(res).toEqual({ skipped: 'flag economy_guard is off' });
    expect(on.state()?.guard).toBe('ok');
  });

  it('leaves a ceiling the owner or the AWS budget capped alone', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      scaleMode: { mode: 'min', by: 'owner', at: NOW.toISOString() },
    });
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).not.toHaveBeenCalled();
    expect(t.aws.setScale).not.toHaveBeenCalled();
  });

  it('auto ceiling: rises only gradually, up to what the rule pays', async () => {
    const t = setup({
      revenueCents: 10_000_000, // $100k → allowed $50k
      awsActual: 50,
      awsForecast: 100,
    });
    await t.svc.tick(NOW);
    // First application takes the target (cap 50 / 20)…
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 50, worker: 20 });
    // …and later the stored snapshot limits growth to +5 per tick.
  });

  it('auto ceiling: a previous ceiling grows by at most 5 per tick', async () => {
    const t = setup({
      revenueCents: 10_000_000,
      awsActual: 50,
      awsForecast: 100,
    });
    await t.ops.setCeiling({
      api: 4,
      worker: 2,
      mode: 'auto',
      at: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 9, worker: 7 });
  });

  it('manual mode: the owner number, clamped to the Terraform cap', async () => {
    const t = setup({ mode: 'manual', awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 6, worker: 3 });
    expect(t.ceiling()?.mode).toBe('manual');
  });

  it('off AWS (local Mac, CI) it only evaluates, never touches ECS', async () => {
    const t = setup({ onAws: false, awsActual: 150, awsForecast: 400 });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('limited');
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.aws.setCeilings).not.toHaveBeenCalled();
  });

  it('raises a DB CPU alert once per window', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      capacityMetrics: { dbCpuPercent: 82 },
    });
    await t.svc.tick(NOW);
    await t.svc.tick(NOW);
    const alerts = t.events.filter((e) => e.kind === 'db_cpu');
    expect(alerts).toHaveLength(1);
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'capacity_pressure', kind: 'db_cpu' }),
      expect.any(String),
    );
  });
});

describe('EconomyService.increase', () => {
  it('moves one tier up and records an event', async () => {
    const t = setup({ capacityMetrics: {} });
    const r = await t.svc.increase('db', NOW);
    expect(r).toEqual({ from: 'db.t4g.medium', to: 'db.t4g.large' });
    expect(t.events[0].kind).toBe('scaled_up');
  });
});

describe('EconomyService.decrease', () => {
  it('moves one tier down when the load is low and records an event', async () => {
    const t = setup({
      capacityMetrics: { dbCpuPercent: 10, dbConnections: 20 },
    });
    const r = await t.svc.decrease('db', NOW);
    expect(r).toEqual({
      ok: true,
      from: 'db.t4g.medium',
      to: 'db.t4g.small',
    });
    expect(t.events[0].kind).toBe('scaled_down');
  });

  it('refuses while the database is busy, and never touches AWS', async () => {
    const t = setup({
      capacityMetrics: { dbCpuPercent: 55, dbConnections: 20 },
    });
    const r = await t.svc.decrease('db', NOW);
    expect(r).toMatchObject({ ok: false, reason: 'busy' });
    expect(t.events).toHaveLength(0);
  });

  it('refuses blind when the load is unknown', async () => {
    const t = setup({ capacityMetrics: {} });
    expect(await t.svc.decrease('db', NOW)).toMatchObject({
      ok: false,
      reason: 'busy',
    });
  });

  it('refuses Redis when the memory would not fit the smaller node', async () => {
    const t = setup({ capacityMetrics: { redisMemoryPercent: 60 } });
    expect(await t.svc.decrease('redis', NOW)).toMatchObject({
      ok: false,
      reason: 'busy',
    });
  });
});
