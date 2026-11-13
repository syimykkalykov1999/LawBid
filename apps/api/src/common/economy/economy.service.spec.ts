/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { EconomyService } from './economy.service';
import { AdminSummaryService } from '../admin-summary/admin-summary.service';
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
  /** The AWS budget (AWS Budgets limit), default $200. */
  awsBudget?: number;
  /** economy.aws_cap_usd (owner 2026-11-09); 0 = no money ceiling. */
  awsCap?: number;
  /** Owner 2026-11-08: a fresh Twilio reading with this month forecast,
   * the simplest third-party spend. */
  thirdPartyForecast?: number;
  smsMonth?: number;
  idCheckMonth?: number;
  /** Vendor readings from the spend snapshot (S9-1). */
  vendors?: Record<string, unknown>[];
  refundedCents?: number;
  paymentCount?: number;
  onAws?: boolean;
  scaleMode?: ScaleMode | null;
  running?: { api: number; worker: number };
  stored?: Record<string, unknown>;
  capacityMetrics?: Partial<CapacityReading>;
  mode?: 'auto' | 'manual';
  /** Row 67: scale.max_tasks.api / .worker (default 50 / 20 here). */
  maxTasks?: { api: number; worker: number };
  /** R-369: the shared admin summary (absent = no cache). */
  summary?: AdminSummaryService;
}

/** A fresh Twilio reading: [forecast] for the month, half spent. */
function twilio(forecast: number) {
  return {
    id: 'twilio',
    status: 'ok',
    monthToDateUsd: forecast / 2,
    forecastUsd: forecast,
    updatedAt: NOW.toISOString(),
  };
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
            limitUsd: o.awsBudget ?? 200,
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
    'economy.daily_brake_days': 3,
    'scale.endpoints.mode': 'auto',
    'scale.endpoints.ceiling': 4,
    'economy.aws_fallback_usd': 150,
    // The owner's sum; the older cases ran with the AWS budget as the cap.
    'economy.aws_cap_usd': o.awsCap ?? o.awsBudget ?? 200,
    // Owner 2026-11-12 (row 67): the owner's ceilings (default 100); the
    // older cases ran with Terraform caps 50 / 20.
    'scale.max_tasks.api': o.maxTasks?.api ?? 50,
    'scale.max_tasks.worker': o.maxTasks?.worker ?? 20,
    'scale.spot_fallback.mode': 'auto',
  };
  const settings = {
    number: jest.fn(async (k: string) => settingValues[k] as number),
    string: jest.fn(async (k: string) => settingValues[k] as string),
  };

  const prisma = {
    // S9-3: one raw query per window; revenueCents = price before tax.
    $queryRaw: jest.fn(async () => [
      {
        subtotal_cents: o.revenueCents ?? 0,
        gross_cents: o.revenueCents ?? 0,
        payments: o.paymentCount ?? 0,
        refunded_cents: o.refundedCents ?? 0,
      },
    ]),
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
  const redis = {
    del: jest.fn(async () => 1),
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
  };
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
    setOtherCeilings: jest.fn(async (c: Record<string, number>) => c),
  };
  const cap = {
    available: !!o.capacityMetrics,
    readable: !!o.capacityMetrics,
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
      month:
        p === 'sms'
          ? (o.smsMonth ?? 0)
          : p === 'id_check'
            ? (o.idCheckMonth ?? 0)
            : 0,
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
  const storage = {
    awsBucket: jest.fn(() => 'docs-bucket'),
    put: jest.fn(async () => undefined),
  };
  const spend = {
    report: jest.fn(async () => ({
      vendors: [
        ...(o.vendors ?? []),
        ...(o.thirdPartyForecast === undefined
          ? []
          : [twilio(o.thirdPartyForecast)]),
      ],
    })),
  };

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
    spend as never,
    storage as never,
    undefined,
    o.summary,
  );
  return {
    spend,
    svc,
    ops,
    aws,
    cap,
    prisma,
    logger,
    redis,
    storage,
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
    // net: $100 minus the 2.9 % Stripe fee (S9-3)
    expect(lowRevenue.revenue30dUsd).toBe(97.1);
    expect(lowRevenue.allowedUsd).toBe(150);
    const rich = await setup({ revenueCents: 1_000_000 }).svc.figures(NOW);
    expect(rich.allowedUsd).toBe(4855);
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
    // 1000 SMS × $0.0115 (the price book) = $11.5 in 16 days of 31.
    expect(sms.monthToDateUsd).toBe(11.5);
    expect(sms.projectedUsd).toBeCloseTo(22.28, 1);
    expect(f.projectedUsd).toBeCloseTo(160 + 22.28, 1);
  });

  it('S9-1: counts identity checks ($1.50 each) in the projection', async () => {
    const f = await setup({
      awsActual: 80,
      awsForecast: 160,
      idCheckMonth: 10,
    }).svc.figures(NOW);
    const id = f.lines.find((l) => l.key === 'id_check')!;
    expect(id.monthToDateUsd).toBe(15);
    expect(f.projectedUsd).toBeGreaterThan(160 + 15);
  });

  it('S9-1: e-mail and moderation lines are shown but not added twice when AWS is read', async () => {
    const f = await setup({ awsActual: 80, awsForecast: 160 }).svc.figures(NOW);
    expect(f.lines.find((l) => l.key === 'email')).toMatchObject({
      coveredBy: 'aws',
    });
    const off = await setup({ awsActual: null }).svc.figures(NOW);
    expect(off.lines.find((l) => l.key === 'email')?.coveredBy).toBeUndefined();
  });

  it('S9-1: uses the vendor number (Twilio) first, the counters only when it is down', async () => {
    const twilio = {
      id: 'twilio',
      status: 'ok',
      monthToDateUsd: 40,
      forecastUsd: 80,
      updatedAt: NOW.toISOString(),
    };
    const up = await setup({
      awsActual: 80,
      awsForecast: 160,
      smsMonth: 1000,
      vendors: [twilio],
    }).svc.figures(NOW);
    expect(up.lines.find((l) => l.key === 'sms')).toMatchObject({
      monthToDateUsd: 40,
      projectedUsd: 80,
      source: 'actual',
    });
    const down = await setup({
      awsActual: 80,
      awsForecast: 160,
      smsMonth: 1000,
      vendors: [{ ...twilio, status: 'nodata', monthToDateUsd: null }],
    }).svc.figures(NOW);
    expect(down.lines.find((l) => l.key === 'sms')).toMatchObject({
      monthToDateUsd: 11.5,
      source: 'estimate',
    });
  });

  it('S9-3: revenue is net of tax, refunds and the Stripe fee', async () => {
    const f = await setup({
      revenueCents: 100_000,
      refundedCents: 10_000,
      paymentCount: 10,
    }).svc.figures(NOW);
    // 1000 - 100 refunds - (2.9 % of 1000 = 29 + 10 × 0.30 = 3) = $868
    expect(f.revenue30dUsd).toBe(868);
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
  it('owner rule: publishes the off/on/auto control and ceiling for the Lambda, only when changed', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.storage.put).toHaveBeenCalledWith(
      'docs-bucket',
      'ops/scale-controls.json',
      Buffer.from(
        '{"endpoints":{"mode":"auto","ceiling":4},"spot_fallback":{"mode":"auto"}}',
      ),
      'application/json',
    );
    (t.redis.get as jest.Mock).mockResolvedValue(
      '{"endpoints":{"mode":"auto","ceiling":4},"spot_fallback":{"mode":"auto"}}',
    );
    t.storage.put.mockClear();
    await t.svc.tick(NOW);
    expect(t.storage.put).not.toHaveBeenCalled();
  });

  it('S9-4: publishes the daily money brake from the allowance', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    // allowed $150 / 30 × 3 days = $15 = 1500 cents
    expect(t.redis.set).toHaveBeenCalledWith(
      'economy:daily_brake_cents',
      '1500',
      'EX',
      86_400,
    );
  });

  it('does nothing restrictive while spend is under the rule', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.state()).toBeNull();
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.logger.warn).not.toHaveBeenCalled();
  });

  it('switches the guard on above the rule: floors caps, alerts, never caps containers', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
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
    // Owner 2026-11-08: high third-party spend alone never caps containers.
    expect(t.aws.setScale).not.toHaveBeenCalledWith('min');
    expect(t.scale()).toBeNull();
    expect(t.events.map((e) => e.kind)).toContain('guard_on');
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'economy_guard_on' }),
      expect.any(String),
    );
  });

  it('never raises a provider the owner switched off (cap 0)', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
      stored: { 'budget.video.daily_max': 0 },
    });
    await t.svc.tick(NOW);
    expect(t.stored['budget.video.daily_max']).toBe(0);
  });

  it('is idempotent: a second tick over the line changes nothing more', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
    });
    await t.svc.tick(NOW);
    t.aws.setScale.mockClear();
    t.ops.pushEconomyEvent.mockClear();
    await t.svc.tick(NOW);
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.events.filter((e) => e.kind === 'guard_on')).toHaveLength(1);
  });

  it('releases below 90 % of the allowance and restores the caps', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
      stored: { 'budget.sms.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    // Third-party spend drops.
    t.spend.report.mockResolvedValue({ vendors: [twilio(60)] });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('ok');
    expect(t.stored['budget.sms.daily_max']).toBe(900);
    expect(t.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['guard_on', 'guard_off']),
    );
    // The container ceiling followed the AWS budget all along.
    expect(t.aws.setCeilings).toHaveBeenCalled();
    expect(t.aws.setScale).not.toHaveBeenCalled();
  });

  it('keeps hysteresis: still limited between 90 % and 100 %', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
    });
    await t.svc.tick(NOW);
    t.spend.report.mockResolvedValue({ vendors: [twilio(145)] }); // 96 % of $150
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('limited');
  });

  it('does not overwrite a cap an admin edited during the guard', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
      stored: { 'budget.sms.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    t.stored['budget.sms.daily_max'] = 250; // the admin's edit
    t.spend.report.mockResolvedValue({ vendors: [twilio(60)] });
    await t.svc.tick(NOW);
    expect(t.stored['budget.sms.daily_max']).toBe(250);
  });

  it('flag off: releases a running guard and acts no more', async () => {
    const on = setup({
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
    });
    await on.svc.tick(NOW);
    // Same instance, flag now off.
    (on.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    const res = await on.svc.tick(NOW);
    expect(res).toMatchObject({ skipped: 'flag economy_guard is off' });
    expect(on.state()?.guard).toBe('ok');
  });

  it('owner 2026-11-09: switched off, it lifts the ceilings it left behind to the Terraform maximum', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.ops.setCeiling({
      api: 3,
      worker: 1,
      mode: 'auto',
      at: NOW.toISOString(),
    });
    (t.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 50, worker: 20 });
  });

  it('row 67: the owner ceilings of api-admin, admin and the pooler are written every tick', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.aws.setOtherCeilings).toHaveBeenLastCalledWith({
      api_admin: 100,
      admin: 100,
      pgbouncer: 100,
    });
    (t.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    t.aws.setOtherCeilings.mockClear();
    await t.svc.tick(NOW);
    expect(t.aws.setOtherCeilings).toHaveBeenCalledTimes(1);
  });

  it('13.11 (KE 135): switched off, the owner controls still reach the Lambdas (ops/scale-controls.json)', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100 });
    (t.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    await t.svc.tick(NOW);
    expect(t.storage.put).toHaveBeenCalledWith(
      expect.anything(),
      'ops/scale-controls.json',
      expect.anything(),
      'application/json',
    );
  });

  it('row 67: no upper bound — the owner number above the Terraform start ceiling is used as is', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      awsCap: 0,
      maxTasks: { api: 5000, worker: 300 },
    });
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({
      api: 5000,
      worker: 300,
    });
  });

  it('owner 2026-11-10: switched off, it still reads the database and Redis size for «Масштаб»', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      capacityMetrics: { dbCpuPercent: 12 },
    });
    (t.svc as unknown as { flags: { isEnabled: jest.Mock } }).flags.isEnabled =
      jest.fn(async () => false);
    await t.svc.tick(NOW);
    expect(t.ops.setCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        at: NOW.toISOString(),
        dbClass: 'db.t4g.medium',
        redisClass: 'cache.t4g.micro',
        dbCpuPercent: 12,
      }),
    );
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

  it('auto ceiling: rises only gradually, up to what the AWS budget pays', async () => {
    const t = setup({
      revenueCents: 10_000_000, // $100k → allowed $50k
      awsActual: 50,
      awsForecast: 100,
      awsBudget: 50_000,
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
      awsBudget: 50_000,
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

  it('owner 2026-11-09: no sum typed = the Terraform maximum at once, no AWS brake', async () => {
    const t = setup({
      awsCap: 0,
      awsActual: 400,
      awsForecast: 900, // far over the $200 AWS Budgets alert
    });
    await t.ops.setCeiling({
      api: 3,
      worker: 1,
      mode: 'auto',
      at: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.aws.setScale).not.toHaveBeenCalledWith('min');
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 50, worker: 20 });
  });

  it('manual mode: the owner number, clamped to the Terraform cap', async () => {
    const t = setup({ mode: 'manual', awsActual: 50, awsForecast: 100 });
    await t.svc.tick(NOW);
    expect(t.aws.setCeilings).toHaveBeenLastCalledWith({ api: 6, worker: 3 });
    expect(t.ceiling()?.mode).toBe('manual');
  });

  it('off AWS (local Mac, CI) it only evaluates, never touches ECS', async () => {
    const t = setup({
      onAws: false,
      awsActual: 50,
      awsForecast: 100,
      thirdPartyForecast: 400,
    });
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

describe('EconomyService: two brakes, each braking only what it controls (owner 2026-11-08)', () => {
  it('figures: third-party, AWS and the combined total apart', async () => {
    const f = await setup({
      awsActual: 80,
      awsForecast: 160,
      awsBudget: 450,
      thirdPartyForecast: 40,
    }).svc.figures(NOW);
    expect(f.awsProjectedUsd).toBe(160);
    expect(f.awsLimitUsd).toBe(450);
    expect(f.thirdPartyProjectedUsd).toBeCloseTo(40, 1);
    expect(f.projectedUsd).toBeCloseTo(200, 1);
    expect(f.allowedUsd).toBe(150);
  });

  it('a high AWS forecast alone never pauses video uploads or SMS', async () => {
    const t = setup({
      awsActual: 150,
      awsForecast: 441,
      awsBudget: 200,
      stored: { 'budget.sms.daily_max': 900, 'budget.video.daily_max': 900 },
    });
    await t.svc.tick(NOW);
    expect(t.state()?.guard ?? 'ok').toBe('ok');
    expect(t.stored['budget.sms.daily_max']).toBe(900);
    expect(t.stored['budget.video.daily_max']).toBe(900);
    expect(t.events.map((e) => e.kind)).not.toContain('guard_on');
    // …it caps AWS only: containers at the minimum, with its own text.
    expect(t.aws.setScale).toHaveBeenCalledWith('min');
    expect(t.scale()).toMatchObject({ mode: 'min', source: 'economy' });
    const ceiling = t.events.find((e) => e.kind === 'ceiling');
    expect(ceiling?.text).toContain('Счёт AWS');
    expect(ceiling?.text).toContain('Видео и SMS этот тормоз не трогает');
  });

  it('high third-party spend alone never caps containers', async () => {
    const t = setup({
      awsActual: 50,
      awsForecast: 100,
      awsBudget: 450,
      thirdPartyForecast: 400,
    });
    await t.svc.tick(NOW);
    expect(t.state()?.guard).toBe('limited');
    expect(t.aws.setScale).not.toHaveBeenCalled();
    expect(t.aws.setCeilings).toHaveBeenCalled();
    const on = t.events.find((e) => e.kind === 'guard_on');
    expect(on?.text).toContain('сторонние платные сервисы');
    expect(on?.text).toContain(
      'Серверы, база и Redis AWS этот тормоз не трогает',
    );
  });

  it('the AWS brake keeps hysteresis: held between 90 % and 100 % of the budget, released below', async () => {
    const t = setup({ awsActual: 150, awsForecast: 441, awsBudget: 450 });
    t.ops.cost.mockResolvedValue({
      actualUsd: 150,
      forecastUsd: 460,
      limitUsd: 450,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.scale()).toMatchObject({ mode: 'min', source: 'economy' });
    t.ops.cost.mockResolvedValue({
      actualUsd: 150,
      forecastUsd: 430, // 96 % of $450
      limitUsd: 450,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.scale()).toMatchObject({ mode: 'min', source: 'economy' });
    t.ops.cost.mockResolvedValue({
      actualUsd: 150,
      forecastUsd: 300,
      limitUsd: 450,
      checkedAt: NOW.toISOString(),
    });
    await t.svc.tick(NOW);
    expect(t.scale()).toMatchObject({ mode: 'normal', source: 'economy' });
  });

  it('DB / Redis money ceilings follow the owner sum, not the third-party allowance', async () => {
    const t = setup({ awsActual: 50, awsForecast: 100, awsCap: 450 });
    const ssm = {
      available: true,
      maxClassParam: jest.fn((target: string) => `/p/${target}`),
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
    };
    (t.svc as unknown as { ssm: unknown }).ssm = ssm;
    (
      t.svc as unknown as { settingsSvc: { string: jest.Mock } }
    ).settingsSvc.string = jest.fn(async () => 'auto');
    await t.svc.tick(NOW);
    expect(t.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ awsCapUsd: 450 }),
      'autoscale money ceiling updated',
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

/** In-memory stand-in for the ioredis calls AdminSummaryService makes. */
function summaryRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  };
}

const never = <T>() => new Promise<T>(() => undefined);

describe('EconomyService.report (R-369: «Масштаб» opens at once)', () => {
  beforeEach(() =>
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }),
  );
  afterEach(() => jest.useRealTimers());

  it('a hung AWS call costs at most 3 s and shows «н/д», not a stuck page', async () => {
    jest.useRealTimers();
    const t = setup();
    t.aws.taskCounts.mockImplementation(never);
    t.aws.ceilingsNow.mockImplementation(never);
    t.spend.report.mockImplementation(never);
    const started = Date.now();
    const r = await t.svc.report(NOW);
    const ms = Date.now() - started;
    // Before: the three calls ran one after another without any limit.
    expect(ms).toBeLessThan(3_900);
    expect(r.containers.api.running).toBeNull();
    expect(r.containers.api.hardCap).toBe(50);
    expect(r.figures.lines[0].key).toBe('aws');
  }, 10_000);

  it('asks ECS and Auto Scaling together, not one after another', async () => {
    const t = setup();
    let inFlight = 0;
    let peak = 0;
    const slow =
      <T>(v: T) =>
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return v;
      };
    t.aws.taskCounts.mockImplementation(
      slow({
        api: { running: 2, desired: 2 },
        worker: { running: 1, desired: 1 },
      }),
    );
    t.aws.ceilingsNow.mockImplementation(slow(null));
    const r = await t.svc.report(NOW);
    expect(peak).toBe(2);
    expect(r.containers.api.running).toBe(2);
  });

  it('GET serves the shared copy: AWS is asked once for many opens', async () => {
    jest.useRealTimers();
    const summary = new AdminSummaryService(summaryRedis() as never);
    const t = setup({ summary });
    const first = await t.svc.cachedReport();
    const again = await t.svc.cachedReport();
    expect(again).toEqual(first);
    expect(t.aws.taskCounts).toHaveBeenCalledTimes(1);
  });

  it('a stale copy is returned at once while one refresh runs behind it', async () => {
    jest.useRealTimers();
    const redis = summaryRedis();
    const summary = new AdminSummaryService(redis as never);
    const t = setup({ summary });
    const old = await t.svc.report(NOW);
    const key = [...redis.store.keys()].find((k) =>
      k.endsWith('economy:report'),
    )!;
    const stored = JSON.parse(redis.store.get(key)!) as { computedAt: string };
    stored.computedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    redis.store.set(key, JSON.stringify(stored));
    t.aws.taskCounts.mockImplementation(never); // the refresh is slow…
    const started = Date.now();
    const r = await t.svc.cachedReport(); // …but the page does not wait for it
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.containers.api.running).toBe(old.containers.api.running);
    await new Promise((done) => setTimeout(done, 50));
    expect(t.aws.taskCounts).toHaveBeenCalledTimes(2); // the background refresh
  });

  it('a button result replaces the shared copy at once', async () => {
    jest.useRealTimers();
    const summary = new AdminSummaryService(summaryRedis() as never);
    const t = setup({ summary });
    await t.svc.cachedReport();
    t.aws.taskCounts.mockResolvedValue({
      api: { running: 7, desired: 7 },
      worker: { running: 1, desired: 1 },
    });
    await t.svc.report(NOW);
    expect((await t.svc.cachedReport()).containers.api.running).toBe(7);
  });
});
