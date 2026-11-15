import { HEAVY_CRON_JOBS } from '../common/ops/ops.constants';
import {
  CRON_HEAVY_FREQUENT_QUEUE,
  CRON_HEAVY_QUEUE,
  CRON_QUEUE,
  CRON_SCHEDULES,
  HEAVY_JOBS,
  cronLaneOf,
  isSubHourly,
} from './jobs.constants';
import { cronPeriodMs } from './cron-run';
import { waitingAgeSeconds } from './handlers/ops-metrics.job';

/** 08.11 (G8, queue-backlog alarm): the one-at-a-time `cron` lane carries
 * only quick jobs, and the backlog age measures real waiting. */
describe('cron lanes', () => {
  it('no job marked heavy (pause list) runs on the default `cron` lane', () => {
    const scheduled = new Set(CRON_SCHEDULES.map((s) => s.name as string));
    const onCron = HEAVY_CRON_JOBS.filter(
      (name) => scheduled.has(name) && cronLaneOf(name) === CRON_QUEUE,
    );
    expect(onCron).toEqual([]);
  });

  it('the three moved jobs are on a heavy lane', () => {
    expect(cronLaneOf('db.bloat-check')).toBe(CRON_HEAVY_QUEUE);
    // Batch D: the two sub-hourly ones run on the frequent heavy lane.
    for (const n of ['search.trending-tags', 'chat.search-backfill']) {
      expect(cronLaneOf(n)).toBe(CRON_HEAVY_FREQUENT_QUEUE);
    }
  });

  // Batch D (14.11): legal.exports (every minute) and admin.summaries
  // (every 2) waited behind multi-hour nightly jobs on one-at-a-time
  // `cron-heavy`.
  it('no sub-hourly job shares cron-heavy with the nightly jobs', () => {
    const onHeavy = CRON_SCHEDULES.filter(
      (s) => cronLaneOf(s.name) === CRON_HEAVY_QUEUE,
    );
    expect(onHeavy.filter((s) => isSubHourly(s.pattern))).toEqual([]);
    expect(onHeavy.length).toBeGreaterThan(10);
  });

  it('the frequent heavy jobs are on cron-heavy-frequent', () => {
    for (const n of [
      'legal.exports',
      'admin.summaries',
      'feed.reco',
      'search.trending-tags',
      'messages.reencrypt',
    ]) {
      expect(cronLaneOf(n)).toBe(CRON_HEAVY_FREQUENT_QUEUE);
    }
    const frequent = CRON_SCHEDULES.filter(
      (s) => cronLaneOf(s.name) === CRON_HEAVY_FREQUENT_QUEUE,
    );
    for (const s of frequent) {
      expect(HEAVY_JOBS).toContain(s.name);
      expect(isSubHourly(s.pattern)).toBe(true);
    }
  });
});

describe('cronPeriodMs (last-good-run alarm)', () => {
  const MIN = 60_000;
  it('reads the shapes of our schedules', () => {
    expect(cronPeriodMs('* * * * *')).toBe(MIN);
    expect(cronPeriodMs('*/2 * * * *')).toBe(2 * MIN);
    expect(cronPeriodMs('5-55/10 * * * *')).toBe(10 * MIN);
    expect(cronPeriodMs('20 * * * *')).toBe(60 * MIN);
    expect(cronPeriodMs('15 3 * * *')).toBe(24 * 60 * MIN);
    expect(cronPeriodMs('0 13 * * 1')).toBe(7 * 24 * 60 * MIN);
    expect(cronPeriodMs('30 4 1 * *')).toBe(31 * 24 * 60 * MIN);
  });

  it('every schedule has a period between a minute and a month, sub-hourly ones under an hour', () => {
    for (const s of CRON_SCHEDULES) {
      const p = cronPeriodMs(s.pattern);
      expect(p).toBeGreaterThanOrEqual(MIN);
      expect(p).toBeLessThanOrEqual(31 * 24 * 60 * MIN);
      if (isSubHourly(s.pattern)) expect(p).toBeLessThan(60 * MIN);
    }
  });
});

describe('waitingAgeSeconds (backlog age)', () => {
  const now = new Date('2026-11-08T20:05:00.000Z');

  it('a scheduled run created an hour ahead and due just now has waited 0 s', () => {
    // BullMQ job scheduler: timestamp = creation, delay = until due.
    const created = now.getTime() - 3_600_000;
    expect(
      waitingAgeSeconds({ timestamp: created, delay: 3_600_000 }, now),
    ).toBe(0);
    // the old formula said 3600 s
    expect(Math.floor((now.getTime() - created) / 1000)).toBe(3600);
  });

  it('a due job that really waits 7 minutes reads 420 s', () => {
    const created = now.getTime() - 12 * 60_000;
    expect(
      waitingAgeSeconds({ timestamp: created, delay: 5 * 60_000 }, now),
    ).toBe(420);
  });

  it('an ordinary job (no delay) counts from its creation; opts.delay is read too', () => {
    expect(waitingAgeSeconds({ timestamp: now.getTime() - 30_000 }, now)).toBe(
      30,
    );
    expect(
      waitingAgeSeconds(
        { timestamp: now.getTime() - 90_000, opts: { delay: 60_000 } },
        now,
      ),
    ).toBe(30);
  });
});
