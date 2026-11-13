import {
  computeTargets,
  dayStamp,
  parseAutoscaleSettings,
  staleHistoryFields,
  summarizeUsage,
  type UsageSummary,
} from './cost-autoscale.rules';
import type { CostWindow } from './cost-guard.constants';

const ENV: Record<CostWindow, number> = {
  minute: 30,
  daily: 300,
  monthly: 5000,
};
const env = (_p: string, w: CostWindow) => ENV[w];

const BOUNDS = {
  minute: { floor: 30, ceiling: 300 },
  daily: { floor: 300, ceiling: 3000 },
  monthly: { floor: 5000, ceiling: 50000 },
};

const usage = (u: Partial<UsageSummary>): UsageSummary => ({
  dailyPeak: 0,
  monthToDate: 0,
  lastMonthTotal: 0,
  elapsedDays: 15,
  daysInMonth: 30,
  ...u,
});

describe('parseAutoscaleSettings', () => {
  it('defaults every cap to auto with floor = env default and ceiling = floor × 10', () => {
    const s = parseAutoscaleSettings(undefined, env);
    expect(s.sms.daily).toEqual({ mode: 'auto', floor: 300, ceiling: 3000 });
    expect(s.video.minute).toEqual({ mode: 'auto', floor: 30, ceiling: 300 });
  });

  it('reads stored fields one by one and falls back on malformed ones', () => {
    const s = parseAutoscaleSettings(
      {
        sms: {
          daily: { mode: 'manual', floor: 100, ceiling: 'lots' },
          monthly: { floor: -5, ceiling: 9000 },
          minute: 'junk',
        },
        email: [],
      },
      env,
    );
    expect(s.sms.daily).toEqual({ mode: 'manual', floor: 100, ceiling: 1000 });
    expect(s.sms.monthly).toEqual({ mode: 'auto', floor: 5000, ceiling: 9000 });
    expect(s.sms.minute).toEqual({ mode: 'auto', floor: 30, ceiling: 300 });
    expect(s.email.daily.mode).toBe('auto');
  });

  it('keeps a switched-off cap (stored 0, no autoscale entry) in manual mode', () => {
    const s = parseAutoscaleSettings({}, env, (p, w) =>
      p === 'sms' && w === 'daily' ? 0 : undefined,
    );
    expect(s.sms.daily.mode).toBe('manual');
    expect(s.sms.monthly.mode).toBe('auto');
    // An explicit entry wins over the switched-off heuristic.
    const explicit = parseAutoscaleSettings(
      { sms: { daily: { mode: 'auto' } } },
      env,
      () => 0,
    );
    expect(explicit.sms.daily.mode).toBe('auto');
  });

  it('gives a floor of 0 a usable default ceiling', () => {
    const s = parseAutoscaleSettings({ sms: { daily: { floor: 0 } } }, env);
    expect(s.sms.daily).toEqual({ mode: 'auto', floor: 0, ceiling: 10 });
  });
});

describe('summarizeUsage', () => {
  const now = new Date('2026-10-05T13:00:00Z');

  it('takes the 7-day peak (today included), month-to-date and last month', () => {
    const s = summarizeUsage(
      {
        '20261005': 40, // today
        '20261001': 90,
        '20260929': 120, // 6 days ago — inside the window
        '20260928': 500, // 7 days ago — outside
        '20260915': 10,
      },
      now,
    );
    expect(s.dailyPeak).toBe(120);
    expect(s.monthToDate).toBe(130);
    expect(s.lastMonthTotal).toBe(630);
    expect(s.elapsedDays).toBe(5);
    expect(s.daysInMonth).toBe(31);
  });

  it('uses the live monthly counter when history is younger than the month', () => {
    expect(summarizeUsage({ '20261005': 4 }, now, 900).monthToDate).toBe(900);
  });

  it('ignores junk values', () => {
    const s = summarizeUsage({ '20261005': NaN, '20261004': -3 }, now);
    expect(s.dailyPeak).toBe(0);
  });
});

describe('computeTargets', () => {
  it('sits at the floor (the old defaults) with no traffic', () => {
    const t = computeTargets(usage({}), BOUNDS);
    expect(t.minute).toEqual({ target: 0, value: 30, clampedBy: 'floor' });
    expect(t.daily).toEqual({ target: 0, value: 300, clampedBy: 'floor' });
    expect(t.monthly).toEqual({ target: 0, value: 5000, clampedBy: 'floor' });
  });

  it('rises with growth: daily 2× peak, minute 30× average rate, monthly 1.5× projection', () => {
    const t = computeTargets(
      usage({ dailyPeak: 600, monthToDate: 6000, elapsedDays: 10 }),
      BOUNDS,
    );
    expect(t.daily.value).toBe(1200);
    expect(t.minute.value).toBe(30); // ceil(600/1440*30) = 13 → floor 30
    // projected 6000/10*30 = 18000 → ×1.5
    expect(t.monthly).toEqual({ target: 27000, value: 27000, clampedBy: null });
  });

  it('per-minute target follows a large peak', () => {
    const t = computeTargets(usage({ dailyPeak: 2880 }), {
      ...BOUNDS,
      daily: { floor: 0, ceiling: 100000 },
    });
    expect(t.minute.target).toBe(60);
    expect(t.minute.value).toBe(60);
  });

  it('uses last month when it was bigger than the projection', () => {
    const t = computeTargets(
      usage({ lastMonthTotal: 20000, monthToDate: 100, elapsedDays: 20 }),
      BOUNDS,
    );
    expect(t.monthly.value).toBe(30000);
  });

  it('does not extrapolate wildly in the first days of a month', () => {
    const t = computeTargets(
      usage({ monthToDate: 1000, elapsedDays: 1, daysInMonth: 30 }),
      BOUNDS,
    );
    // 1000 / 3 * 30 = 10000 → ×1.5 = 15000 (not 1000 × 30 × 1.5)
    expect(t.monthly.value).toBe(15000);
  });

  it('keeps monthly ≥ daily', () => {
    const t = computeTargets(usage({ dailyPeak: 2000 }), {
      ...BOUNDS,
      monthly: { floor: 0, ceiling: 100000 },
    });
    expect(t.daily.value).toBe(3000); // ceiling
    expect(t.monthly.target).toBe(4000);
  });

  it('stops at the ceiling and says so', () => {
    const t = computeTargets(usage({ dailyPeak: 5000 }), BOUNDS);
    expect(t.daily).toEqual({
      target: 10000,
      value: 3000,
      clampedBy: 'ceiling',
    });
  });

  it('lets a ceiling below the floor win (it is the safety limit)', () => {
    const t = computeTargets(usage({}), {
      ...BOUNDS,
      daily: { floor: 500, ceiling: 200 },
    });
    expect(t.daily.value).toBe(200);
    expect(t.daily.clampedBy).toBe('ceiling');
  });

  it('falls back when traffic drops', () => {
    const busy = computeTargets(usage({ dailyPeak: 1000 }), BOUNDS);
    const quiet = computeTargets(usage({ dailyPeak: 200 }), BOUNDS);
    expect(busy.daily.value).toBe(2000);
    expect(quiet.daily.value).toBe(400);
  });
});

describe('history helpers', () => {
  it('dayStamp is UTC yyyymmdd', () => {
    expect(dayStamp(new Date('2026-09-30T23:59:59Z'))).toBe('20260930');
  });

  it('staleHistoryFields drops days older than the retention and junk', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(
      staleHistoryFields(
        ['20261005', '20260826', '20260825', 'oops', '20260901'],
        now,
      ),
    ).toEqual(['20260826', '20260825', 'oops']);
  });
});
