import {
  ExperimentMetricsService,
  summarize,
} from './experiment-metrics.service';

type Sql = { sql?: string; strings?: string[] };
const text = (s: Sql) => s.sql ?? (s.strings ?? []).join('?');

/** Per-user stats where every user saw [x] and acted [yPerUser] times, with spread. */
function stats(n: number, x: number, yRate: number) {
  const sx = n * x;
  const sy = n * x * yRate;
  // Users either act on all of what they saw or on none (a noisy, honest spread).
  const sxx = n * x * x;
  const syy = n * x * x * yRate;
  const sxy = n * x * x * yRate;
  return { n, sx, sy, sxx, syy, sxy };
}

function build(opts: {
  ctr: [number, number];
  reports: [number, number];
  exposures?: [number, number];
  cases?: boolean;
}) {
  const [cCtr, tCtr] = opts.ctr;
  const [cRep, tRep] = opts.reports;
  const queryRaw = jest.fn((sql: Sql) => {
    const t = text(sql);
    if (t.includes('case_posted')) {
      return Promise.resolve(
        opts.cases
          ? [
              {
                variant: 'control',
                n: 400,
                s: 400 * 12,
                ss: 400 * 200,
                nobid: 120,
              },
              {
                variant: 'new_formula',
                n: 400,
                s: 400 * 9,
                ss: 400 * 150,
                nobid: 60,
              },
            ]
          : [],
      );
    }
    if (t.includes('experiment_exposures e')) return Promise.resolve([]);
    const row = (variant: string, s: ReturnType<typeof stats>) => ({
      variant,
      ...s,
    });
    if (t.includes("kind = 'click'")) {
      return Promise.resolve([
        row('control', stats(2000, 10, cCtr)),
        row('new_formula', stats(2000, 10, tCtr)),
      ]);
    }
    if (t.includes("kind = 'report'")) {
      return Promise.resolve([
        row('control', stats(2000, 10, cRep)),
        row('new_formula', stats(2000, 10, tRep)),
      ]);
    }
    return Promise.resolve([]);
  });
  const [ec, et] = opts.exposures ?? [2000, 2000];
  const prisma = {
    $queryRaw: queryRaw,
    experimentExposure: {
      groupBy: jest.fn().mockResolvedValue([
        { variant: 'control', _count: { _all: ec } },
        { variant: 'new_formula', _count: { _all: et } },
      ]),
    },
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'experiments.ctr_k' ? 5 : 10),
    ),
  };
  return new ExperimentMetricsService(prisma as never, settings as never);
}

const exp = {
  id: 'e1',
  key: 'case_feed_v2',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'new_formula', weight: 50 },
  ],
  guardrails: {
    reportsRelIncreasePct: 25,
    errorsRelIncreasePct: 25,
    minImpressions: 1000,
  },
  started_at: new Date(Date.now() - 7 * 86_400_000),
  created_at: new Date(Date.now() - 8 * 86_400_000),
};

describe('ExperimentMetricsService.compute', () => {
  it('finds a real CTR lift and says so in Russian', async () => {
    const r = await build({
      ctr: [0.1, 0.13],
      reports: [0.001, 0.001],
    }).compute(exp);
    const ctr = r.metrics.find((m) => m.key === 'ctr')!;
    expect(ctr.variants.control.value).toBeCloseTo(0.1, 6);
    expect(ctr.variants.new_formula.value).toBeCloseTo(0.13, 6);
    expect(ctr.vsControl.new_formula.verdict).toBe('better');
    expect(ctr.vsControl.new_formula.relative).toBeCloseTo(0.3, 6);
    expect(r.guardrail.tripped).toBe(false);
    expect(r.srm.flag).toBe(false);
    expect(r.summary.join(' ')).toMatch(/Лучше надёжно/);
  });

  it('says «разницы не видно» for equal variants', async () => {
    const r = await build({ ctr: [0.1, 0.1], reports: [0.001, 0.001] }).compute(
      exp,
    );
    const ctr = r.metrics.find((m) => m.key === 'ctr')!;
    expect(ctr.vsControl.new_formula.verdict).toBe('same');
    expect(r.summary.join(' ')).toMatch(/Разницы пока не видно/);
  });

  it('trips the reports guardrail when reports jump and the interval is clear', async () => {
    // 0.2% -> 0.6% of impressions: three times as many reports per 1000.
    const r = await build({ ctr: [0.1, 0.1], reports: [0.002, 0.006] }).compute(
      exp,
    );
    expect(r.guardrail.tripped).toBe(true);
    expect(r.guardrail.reasons[0]).toMatch(/жалоб/);
  });

  it('does not trip below the minimum number of impressions', async () => {
    const r = await build({ ctr: [0.1, 0.1], reports: [0.002, 0.006] }).compute(
      {
        ...exp,
        guardrails: { ...exp.guardrails, minImpressions: 1_000_000 },
      },
    );
    expect(r.guardrail.tripped).toBe(false);
  });

  it('does not trip on a small rise inside the allowed percent', async () => {
    const r = await build({ ctr: [0.1, 0.1], reports: [0.01, 0.011] }).compute(
      exp,
    );
    expect(r.guardrail.tripped).toBe(false);
  });

  it('flags a broken split and tells the owner not to trust the numbers', async () => {
    const r = await build({
      ctr: [0.1, 0.13],
      reports: [0.001, 0.001],
      exposures: [2600, 2000],
    }).compute(exp);
    expect(r.srm.flag).toBe(true);
    expect(r.summary[0]).toMatch(/SRM/);
  });

  it('adds the case metrics when case events exist', async () => {
    const r = await build({
      ctr: [0.1, 0.1],
      reports: [0.001, 0.001],
      cases: true,
    }).compute(exp);
    const first = r.metrics.find((m) => m.key === 'first_bid_hours')!;
    expect(first.variants.control.value).toBeCloseTo(12, 6);
    const nobid = r.metrics.find((m) => m.key === 'no_bid_24h')!;
    expect(nobid.variants.control.value).toBeCloseTo(0.3, 6);
    expect(nobid.vsControl.new_formula.verdict).toBe('better');
  });

  it('says there is not enough data when nothing was logged', async () => {
    const svc = build({ ctr: [0, 0], reports: [0, 0] });
    (
      svc as unknown as { prisma: { $queryRaw: jest.Mock } }
    ).prisma.$queryRaw.mockResolvedValue([]);
    const r = await svc.compute(exp);
    expect(r.summary.join(' ')).toMatch(/мало данных/);
  });
});

describe('summarize', () => {
  it('warns about SRM first', () => {
    const lines = summarize(
      [],
      [],
      { p: 0.0001, flag: true, total: 5000 },
      { tripped: false, reasons: [] },
    );
    expect(lines[0]).toMatch(/SRM/);
  });
});
