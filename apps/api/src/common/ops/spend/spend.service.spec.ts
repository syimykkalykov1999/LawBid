import {
  buildVendors,
  DEFAULT_PRICES,
  fixedMonthly,
  linearForecast,
  SpendService,
  type RawSpend,
} from './spend.service';
import { r2OperationClass } from '../usage/spend-clients';

const NOW = new Date('2026-10-10T12:00:00Z'); // day 10 of 31
const prices = DEFAULT_PRICES.map((p) => ({ key: p.key, value: p.value }));
const at = NOW.toISOString();

describe('spend helpers', () => {
  it('forecasts in a straight line over the month', () => {
    expect(linearForecast(10, NOW)).toBe(31);
  });

  it('fixed costs: monthly, a year spread over 12, one-off only in its month', () => {
    expect(
      fixedMonthly(
        { id: 'a', label: 'a', usd: 12, period: 'month' },
        '2026-10',
      ),
    ).toBe(12);
    expect(
      fixedMonthly({ id: 'a', label: 'a', usd: 99, period: 'year' }, '2026-10'),
    ).toBe(8.25);
    const once = {
      id: 'a',
      label: 'a',
      usd: 25,
      period: 'once' as const,
      paidMonth: '2026-10',
    };
    expect(fixedMonthly(once, '2026-10')).toBe(25);
    expect(fixedMonthly(once, '2026-11')).toBe(0);
  });

  it('classifies R2 operations: writes and lists are A, reads B, deletes free', () => {
    expect(r2OperationClass('PutObject')).toBe('A');
    expect(r2OperationClass('ListObjectsV2')).toBe('A');
    expect(r2OperationClass('GetObject')).toBe('B');
    expect(r2OperationClass('DeleteObject')).toBe('free');
  });
});

describe('buildVendors', () => {
  it('AWS: shows what credits cover and forecasts only the part you pay', () => {
    const raw: RawSpend = {
      at,
      aws: {
        triedAt: at,
        at,
        data: {
          monthToDate: { gross: 40, credits: 30 },
          lastMonth: { gross: 100, credits: 100 },
          byService: [{ service: 'Amazon ECS', gross: 40, credits: 30 }],
          daily: [{ date: '2026-10-09', gross: 4, credits: 3 }],
          forecastRestGross: 80,
        },
      },
    };
    const aws = buildVendors(raw, prices, NOW).find((v) => v.id === 'aws')!;
    expect(aws).toMatchObject({
      status: 'ok',
      monthToDateUsd: 10,
      coveredByCreditsUsd: 30,
      lastMonthUsd: 0,
    });
    // gross forecast 120, 75 % of it covered by credits so far.
    expect(aws.forecastUsd).toBe(30);
    expect(aws.daily).toEqual([{ date: '2026-10-09', usd: 1 }]);
    expect(aws.notes.join(' ')).toContain('кредитами');
  });

  it('Cloudflare: free 1000 GB first, then $0.05 per GB, R2 over its free tier', () => {
    const raw: RawSpend = {
      at,
      cloudflare: {
        triedAt: at,
        at,
        data: {
          egressGb: 1200,
          r2: { storageGb: 110, classAOps: 3_000_000, classBOps: 20_000_000 },
          r2Error: null,
        },
      },
    };
    const cf = buildVendors(raw, prices, NOW).find(
      (v) => v.id === 'cloudflare',
    )!;
    // calls 200 GB x 0.05 = 10; storage 100 x 0.015 = 1.5; A 2M x 4.5 = 9; B 10M x 0.36 = 3.6
    expect(cf.monthToDateUsd).toBe(24.1);
    expect(cf.freeTier).toMatchObject({ used: 1200, free: 1000, unit: 'ГБ' });
  });

  it('a prices change applies without asking the vendor again', () => {
    const raw: RawSpend = {
      at,
      cloudflare: {
        triedAt: at,
        at,
        data: { egressGb: 1100, r2: null, r2Error: null },
      },
    };
    const dear = prices.map((p) =>
      p.key === 'cf_realtime_per_gb' ? { ...p, value: 0.1 } : p,
    );
    expect(
      buildVendors(raw, dear, NOW).find((v) => v.id === 'cloudflare')!
        .monthToDateUsd,
    ).toBe(10);
  });

  it('a failed vendor keeps its last numbers and says stale; none at all says nodata', () => {
    const raw: RawSpend = {
      at,
      twilio: {
        triedAt: at,
        at: '2026-10-09T00:00:00Z',
        error: 'Twilio HTTP 503',
        data: {
          thisMonth: {
            total: 5,
            byCategory: [{ category: 'sms-messages-carrierfees', usd: 2 }],
          },
          lastMonth: { total: 7 },
          daily: [],
          balanceUsd: 20,
        },
      },
    };
    const v = buildVendors(raw, prices, NOW);
    const tw = v.find((x) => x.id === 'twilio')!;
    expect(tw).toMatchObject({
      status: 'stale',
      error: 'Twilio HTTP 503',
      monthToDateUsd: 5,
      balanceUsd: 20,
    });
    expect(tw.lines[0].label).toContain('операторов');
    expect(v.find((x) => x.id === 'bunny')).toMatchObject({
      status: 'nodata',
      monthToDateUsd: null,
    });
  });
});

describe('SpendService.refresh', () => {
  function make(
    prev?: RawSpend,
    aws = jest.fn().mockResolvedValue({
      monthToDate: { gross: 1, credits: 0 },
      lastMonth: { gross: 1, credits: 0 },
      byService: [],
      daily: [],
      forecastRestGross: 0,
    }),
  ) {
    const store = new Map<string, string>();
    if (prev) store.set('ops:spend:v1', JSON.stringify(prev));
    const redis = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const svc = new SpendService(
      {
        get: jest.fn().mockResolvedValue(null),
        field: jest.fn().mockResolvedValue(undefined),
        has: jest.fn().mockResolvedValue(false),
      } as never,
      {
        get: (k: string) => (k === 'OPS_AWS_ACCOUNT_ID' ? '1111' : undefined),
      } as never,
      { appConfig: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      redis as never,
      { report: aws } as never,
    );
    return { svc, aws };
  }

  it('asks Cost Explorer (paid) at most once in 6 hours', async () => {
    const first = make();
    await first.svc.refresh(NOW);
    expect(first.aws).toHaveBeenCalledTimes(1);

    const recent = make({
      at,
      aws: {
        triedAt: new Date(NOW.getTime() - 3 * 3600_000).toISOString(),
        at,
        data: undefined,
      },
    });
    await recent.svc.refresh(NOW);
    expect(recent.aws).not.toHaveBeenCalled();

    const old = make({
      at,
      aws: { triedAt: new Date(NOW.getTime() - 7 * 3600_000).toISOString() },
    });
    await old.svc.refresh(NOW);
    expect(old.aws).toHaveBeenCalledTimes(1);
  });

  it('a failing AWS call keeps the old numbers and never throws', async () => {
    const good = {
      monthToDate: { gross: 5, credits: 0 },
      lastMonth: { gross: 1, credits: 0 },
      byService: [],
      daily: [],
      forecastRestGross: 0,
    };
    const { svc } = make(
      {
        at,
        aws: {
          triedAt: '2026-10-01T00:00:00Z',
          at: '2026-10-01T00:00:00Z',
          data: good,
        },
      },
      jest.fn().mockRejectedValue(new Error('AccessDenied')),
    );
    const out = await svc.refresh(NOW);
    expect(out.aws).toMatchObject({ error: 'AccessDenied', data: good });
  });
});
