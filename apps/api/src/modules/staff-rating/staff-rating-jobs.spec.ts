import { StaffDailyStatsJob } from '../../jobs/handlers/staff-daily-stats.job';
import { StaffRatingNightlyJob } from '../../jobs/handlers/staff-rating-nightly.job';
import type { StaffAnomalyService } from './staff-anomaly.service';
import type { StaffDailyStatsService } from './staff-daily-stats.service';
import type { StaffRatingService } from './staff-rating.service';
import type { StaffSamplingService } from './staff-sampling.service';
import { RATING_ON, settingsOf } from './staff-rating.test-support';

/** Anything that is called fails the test: the off switch must stop it all. */
const boom = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`touched: ${String(prop)}`);
    },
  },
);

describe('staff.daily-stats', () => {
  it('rating off (the default): returns at once, nothing touched', async () => {
    const job = new StaffDailyStatsJob(
      settingsOf(),
      boom as unknown as StaffDailyStatsService,
      boom as unknown as StaffSamplingService,
      boom as unknown as StaffAnomalyService,
    );
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
  });

  it('on: yesterday is computed, the dice turn into samples, anomalies only with their switch', async () => {
    const computeDay = jest.fn(() =>
      Promise.resolve({
        rows: [
          { adminId: 'a', role: 'verifier', decided: 50 },
          { adminId: 'b', role: null, decided: 9 },
        ],
        counters: [],
      }),
    );
    const drainQueue = jest.fn(() => Promise.resolve(3));
    const issueGolden = jest.fn(() => Promise.resolve(1));
    const detect = jest.fn(() => Promise.resolve(2));
    const make = (stored: Record<string, unknown>) =>
      new StaffDailyStatsJob(
        settingsOf(stored),
        { computeDay } as unknown as StaffDailyStatsService,
        { drainQueue, issueGolden } as unknown as StaffSamplingService,
        { detect } as unknown as StaffAnomalyService,
      );
    const now = new Date('2026-10-27T01:10:00Z');
    await expect(
      make({ 'staff.rating_enabled': true }).run(now),
    ).resolves.toEqual({
      day: '2026-10-26',
      people: 2,
      samples: 3,
      golden: 1,
      anomalies: 0,
    });
    expect(detect).not.toHaveBeenCalled();
    // golden gets only people with a role and decisions
    expect(
      Array.from(
        (
          issueGolden.mock.calls[0] as unknown as [Map<string, unknown>]
        )[0].keys(),
      ),
    ).toEqual(['a']);
    await expect(make(RATING_ON).run(now)).resolves.toMatchObject({
      anomalies: 2,
    });
    expect(detect).toHaveBeenCalledWith('2026-10-26', expect.any(Array), []);
  });
});

describe('staff.rating-nightly', () => {
  it('rating off (the default): returns at once, nothing touched', async () => {
    const job = new StaffRatingNightlyJob(
      settingsOf(),
      boom as unknown as StaffRatingService,
    );
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
  });

  it('on: runs the nightly rating for the given time', async () => {
    const runNightly = jest.fn(() =>
      Promise.resolve({
        date: '2026-10-27',
        rated: 4,
        lowData: 1,
        suggestions: 2,
      }),
    );
    const job = new StaffRatingNightlyJob(
      settingsOf({ 'staff.rating_enabled': true }),
      { runNightly } as unknown as StaffRatingService,
    );
    const now = new Date('2026-10-27T01:40:00Z');
    await expect(job.run(now)).resolves.toEqual({
      date: '2026-10-27',
      rated: 4,
      lowData: 1,
      suggestions: 2,
    });
    expect(runNightly).toHaveBeenCalledWith(now);
  });
});
