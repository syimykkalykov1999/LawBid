import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import {
  CostRegistryService,
  RegistryModeError,
  searchSignals,
} from './cost-registry.service';

const NOW = new Date('2026-10-15T12:00:00Z');

function make(
  opts: {
    ssmMode?: 'on' | 'off' | 'dry-run' | null;
    stored?: Record<string, unknown>;
    /** R-370: the shared admin summary (absent = no cache). */
    summary?: AdminSummaryService;
  } = {},
) {
  const stored = { ...(opts.stored ?? {}) };
  const writer = {
    write: jest.fn((_a: string, _act: string, v: Record<string, unknown>) => {
      Object.assign(stored, v);
      return Promise.resolve();
    }),
    remove: jest.fn((_a: string, _act: string, keys: string[]) => {
      for (const k of keys) delete stored[k];
      return Promise.resolve();
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const spend = {
    report: jest.fn().mockResolvedValue({
      refreshedAt: NOW.toISOString(),
      vendors: [
        { id: 'aws', monthToDateUsd: 100, forecastUsd: 200, lines: [] },
        { id: 'twilio', monthToDateUsd: 5, forecastUsd: 10, lines: [] },
      ],
      total: { monthToDateUsd: 105, forecastUsd: 210 },
    }),
    raw: jest.fn().mockResolvedValue({
      aws: {
        data: {
          byService: [
            {
              service: 'Amazon Relational Database Service',
              gross: 40,
              credits: 0,
            },
            { service: 'Amazon Mystery', gross: 3, credits: 0 },
          ],
        },
      },
    }),
  };
  const settings = {
    raw: jest.fn((k: string) => Promise.resolve(stored[k])),
    number: jest.fn((k: string) => Promise.resolve(stored[k] as number)),
  };
  const ssmMode = opts.ssmMode === undefined ? 'on' : opts.ssmMode;
  const ssm = {
    modeParam: jest.fn(() => (ssmMode === null ? undefined : '/p/mode')),
    getMode: jest.fn().mockResolvedValue(ssmMode),
    setMode: jest.fn().mockResolvedValue(undefined),
  };
  const ops = {
    workerHeartbeat: jest
      .fn()
      .mockResolvedValue({ at: NOW.toISOString(), mode: 'cron' }),
    isHeavyPaused: jest.fn().mockResolvedValue(false),
    isEconomyLimited: jest.fn().mockResolvedValue(false),
    cost: jest.fn().mockResolvedValue({ actualUsd: 100, limitUsd: 350 }),
    capacity: jest.fn().mockResolvedValue({
      dbCpuPercent: 10,
      dbConnections: 5,
      dbMaxConnections: 100,
      redisMemoryPercent: 20,
    }),
  };
  const redis = {
    get: jest.fn().mockResolvedValue(
      JSON.stringify({
        at: NOW.toISOString(),
        bunny: { bandwidthLevel: 'crit' },
        cloudflare: { level: 'ok' },
      }),
    ),
  };
  const svc = new CostRegistryService(
    spend as never,
    settings as never,
    ssm as never,
    writer as never,
    audit as never,
    ops as never,
    redis as never,
    undefined,
    opts.summary,
  );
  return { svc, writer, audit, ssm, stored, spend, ops, redis };
}

describe('CostRegistryService.report', () => {
  it('merges real numbers, live state, steps and the unclaimed AWS lines', async () => {
    const { svc } = make({ stored: { 'budget.sms.monthly_max': 0 } });
    const r = await svc.report(NOW);
    const rds = r.rows.find((x) => x.id === 'aws.rds')!;
    expect(rds).toMatchObject({
      monthUsd: 40,
      monthSource: 'real',
      projectedUsd: 80,
    });
    const sms = r.rows.find((x) => x.id === 'vendor.twilio')!;
    expect(sms.state).toBe('off');
    expect(sms.editable).toBe(true);
    expect(sms.monthUsd).toBe(5);
    expect(sms.steps.off.length).toBeGreaterThan(0);
    const db = r.rows.find((x) => x.id === 'aws.db_autoscale')!;
    expect(db.state).toBe('auto'); // SSM `on`
    expect(db.editable).toBe(true);
    // Owner 2026-10-26: a whitelisted Terraform row is switched from the
    // admin through a change request; a row outside the whitelist is not.
    const gd = r.rows.find((x) => x.id === 'aws.guardduty')!;
    expect(gd.editable).toBe(true);
    expect(gd.infraSwitch).toBe(true);
    expect(gd.lockedReason).toBeNull();
    expect(gd.steps.off.join(' ')).toContain('guardduty_enabled = false');
    const backup = r.rows.find((x) => x.id === 'aws.backup')!;
    expect(backup.editable).toBe(false);
    expect(backup.infraSwitch).toBe(false);
    expect(backup.lockedReason).toContain('terraform.tfvars');
    expect(r.unclaimed).toEqual([{ service: 'Amazon Mystery', usd: 3 }]);
    expect(r.ladder.dayOne.all[0]).toBeGreaterThan(220);
    expect(r.ladder.scenarios.map((s) => s.users)).toEqual([
      1000, 10000, 100000, 1000000,
    ]);
  });

  it('an autoscaler that is not on AWS is locked, not broken', async () => {
    const { svc } = make({ ssmMode: null });
    const db = (await svc.report(NOW)).rows.find(
      (x) => x.id === 'aws.db_autoscale',
    )!;
    expect(db.editable).toBe(false);
    expect(db.state).toBeNull();
  });
});

describe('CostRegistryService status dots', () => {
  it('reads only cheap cached sources and maps them to green / grey / amber', async () => {
    const { svc, ops } = make();
    const r = await svc.report(NOW);
    const by = (id: string) => r.rows.find((x) => x.id === id)!.status;
    // Owner 2026-11-09: the Bunny upload stop is off by default.
    expect(by('vendor.bunny')).toMatchObject({
      live: 'attention',
      state: 'off',
    });
    expect(by('vendor.bunny').reason).toContain('Bunny');
    expect(by('aws.db_autoscale').live).toBe('idle');
    expect(by('aws.alb').live).toBe('active');
    expect(by('aws.opensearch').live).toBe('idle');
    expect(by('hidden.cron_jobs').live).toBe('active');
    expect(by('hidden.usage_poll').live).toBe('active');
    expect(by('aws.alb').checkedAt).toBe(NOW.toISOString());
    expect(ops.capacity).toHaveBeenCalledTimes(1); // once per report, not per row
  });

  it('pressure, a dead worker and a failing source show up; a failing source never throws', async () => {
    const { svc, ops } = make();
    ops.capacity.mockResolvedValue({
      dbCpuPercent: 95,
      dbConnections: 5,
      dbMaxConnections: 100,
      redisMemoryPercent: 20,
    });
    ops.workerHeartbeat.mockRejectedValue(new Error('redis down'));
    const r = await svc.report(NOW);
    const by = (id: string) => r.rows.find((x) => x.id === id)!.status;
    expect(by('aws.db_autoscale').live).toBe('attention');
    expect(by('hidden.cron_jobs').live).toBe('attention');
  });
});

describe('CostRegistryService.setMode', () => {
  it('app-setting: writes the value through the audited writer', async () => {
    const { svc, writer } = make();
    const r = await svc.setMode(
      'admin-1',
      '1.2.3.4',
      'vendor.rekognition',
      'off',
    );
    expect(r).toEqual({ id: 'vendor.rekognition', state: 'off' });
    expect(writer.write).toHaveBeenCalledWith(
      'admin-1',
      'ops.cost_registry_mode',
      {
        'moderation.image.enabled': 'off',
      },
    );
  });

  it("the 'default' sentinel deletes the stored row (Авто of a provider cap)", async () => {
    const { svc, writer, stored } = make({
      stored: { 'budget.sms.monthly_max': 0 },
    });
    await svc.setMode('a', null, 'vendor.twilio', 'auto');
    expect(writer.remove).toHaveBeenCalledWith('a', 'ops.cost_registry_mode', [
      'budget.sms.monthly_max',
    ]);
    expect(stored['budget.sms.monthly_max']).toBeUndefined();
  });

  it('a provider cap goes to 0 for Выкл', async () => {
    const { svc, stored } = make();
    await svc.setMode('a', null, 'vendor.google_translate', 'off');
    expect(stored['budget.translate.monthly_max']).toBe(0);
  });

  it('ssm-mode: Авто = on, Вкл = dry-run, Выкл = off; audit row written', async () => {
    const { svc, ssm, audit } = make();
    await svc.setMode('a', null, 'aws.db_autoscale', 'on');
    expect(ssm.setMode).toHaveBeenCalledWith('db', 'dry-run');
    await svc.setMode('a', null, 'aws.redis_autoscale', 'auto');
    expect(ssm.setMode).toHaveBeenCalledWith('redis', 'on');
    await svc.setMode('a', null, 'aws.db_autoscale', 'off');
    expect(ssm.setMode).toHaveBeenLastCalledWith('db', 'off');
    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('G2: «Запуски автомасштабов» switches the database AND the Redis Lambda', async () => {
    const { svc, ssm, audit } = make();
    await svc.setMode('a', null, 'hidden.autoscale_lambdas', 'off');
    expect(ssm.setMode).toHaveBeenCalledWith('db', 'off');
    expect(ssm.setMode).toHaveBeenCalledWith('redis', 'off');
    expect(ssm.setMode).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ targets: ['db', 'redis'] }),
      }),
    );
  });

  it('G2: the row shows one state when both agree, none when they differ', async () => {
    const same = make();
    const row = (await same.svc.report(NOW)).rows.find(
      (x) => x.id === 'hidden.autoscale_lambdas',
    )!;
    expect(row.state).toBe('auto');
    expect(row.editable).toBe(true);

    const split = make();
    split.ssm.getMode.mockImplementation((t: string) =>
      Promise.resolve(t === 'db' ? 'on' : 'off'),
    );
    const r2 = (await split.svc.report(NOW)).rows.find(
      (x) => x.id === 'hidden.autoscale_lambdas',
    )!;
    expect(r2.state).toBeNull();
  });

  it('refuses unknown ids, tfvars items, unsupported states and a missing AWS switch', async () => {
    const { svc } = make();
    await expect(svc.setMode('a', null, 'nope', 'on')).rejects.toMatchObject({
      code: 'unknown_item',
    });
    await expect(
      svc.setMode('a', null, 'aws.guardduty', 'off'),
    ).rejects.toMatchObject({ code: 'not_editable' });
    await expect(
      svc.setMode('a', null, 'vendor.twilio', 'on'),
    ).rejects.toMatchObject({ code: 'bad_state' });
    const off = make({ ssmMode: null });
    await expect(
      off.svc.setMode('a', null, 'aws.db_autoscale', 'off'),
    ).rejects.toBeInstanceOf(RegistryModeError);
    expect(off.ssm.setMode).not.toHaveBeenCalled();
  });
});

/** In-memory stand-in for the ioredis calls AdminSummaryService makes. */
function summaryRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
  };
}

const never = <T>() => new Promise<T>(() => undefined);

describe('CostRegistryService cached report (R-370: «Реестр» opens at once)', () => {
  it('a hung SSM read costs at most 3 s and says «AWS не ответил»', async () => {
    const t = make();
    t.ssm.getMode.mockImplementation(never);
    const started = Date.now();
    const r = await t.svc.report(NOW);
    expect(Date.now() - started).toBeLessThan(3_900);
    const db = r.rows.find((x) => x.id === 'aws.db_autoscale')!;
    expect(db.stateKnown).toBe(false);
    expect(db.stateNote).toBe('AWS не ответил на чтение переключателя.');
  }, 10_000);

  it('GET serves the shared copy: the registry is built once for many opens', async () => {
    const summary = new AdminSummaryService(summaryRedis() as never);
    const t = make({ summary });
    const first = await t.svc.cachedReport();
    const again = await t.svc.cachedReport();
    expect(again).toEqual(first);
    expect(t.spend.report).toHaveBeenCalledTimes(1);
  });

  it('a stale copy is returned at once while one refresh runs behind it', async () => {
    const redis = summaryRedis();
    const summary = new AdminSummaryService(redis as never);
    const t = make({ summary });
    await t.svc.report(NOW);
    const key = [...redis.store.keys()].find((k) =>
      k.endsWith('spend:registry'),
    )!;
    const stored = JSON.parse(redis.store.get(key)!) as { computedAt: string };
    stored.computedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    redis.store.set(key, JSON.stringify(stored));
    t.spend.report.mockImplementation(never); // the refresh is slow…
    const started = Date.now();
    const r = await t.svc.cachedReport(); // …but the page does not wait
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.rows.length).toBeGreaterThan(0);
    await new Promise((done) => setTimeout(done, 20));
    expect(t.spend.report).toHaveBeenCalledTimes(2); // the background refresh
  });

  it('report() after a switch change replaces the shared copy at once', async () => {
    const summary = new AdminSummaryService(summaryRedis() as never);
    const t = make({ summary });
    await t.svc.cachedReport();
    t.ssm.getMode.mockResolvedValue('off');
    await t.svc.report();
    const db = (await t.svc.cachedReport()).rows.find(
      (x) => x.id === 'aws.db_autoscale',
    )!;
    expect(db.state).toBe('off');
  });
});

describe('CostRegistryService.signals: the CPU line from Admin → Настройки', () => {
  it('a CPU line under the reading makes db_cpu (lowered to prove the read copy)', async () => {
    const { svc } = make({ stored: { 'economy.db_cpu_limit_percent': 1 } });
    expect((await svc.signals(NOW)).pressures).toContain('db_cpu');
  });
  it('the default line (70) leaves 10 % CPU calm', async () => {
    const { svc } = make({ stored: {} });
    expect((await svc.signals(NOW)).pressures).not.toContain('db_cpu');
  });
});

// Owner 2026-11-12: search engine nodes «Авто» by count (AWS advice: scale
// out on CPUUtilization or JVMMemoryPressure).
describe('searchSignals', () => {
  it('busy on CPU at the line or JVM at 75 %', () => {
    expect(searchSignals(70, 10, 70)).toEqual(['search_busy']);
    expect(searchSignals(20, 75, 70)).toEqual(['search_busy']);
    expect(searchSignals(null, 80, 70)).toEqual(['search_busy']);
  });
  it('idle only when CPU is below half the line AND JVM below 50 %', () => {
    expect(searchSignals(30, 40, 70)).toEqual(['search_idle']);
    expect(searchSignals(30, 60, 70)).toEqual([]);
    expect(searchSignals(40, 40, 70)).toEqual([]);
    expect(searchSignals(30, null, 70)).toEqual([]);
  });
  it('no domain / unknown → nothing', () => {
    expect(searchSignals(null, null, 70)).toEqual([]);
    expect(searchSignals(undefined, undefined, 70)).toEqual([]);
  });
});
