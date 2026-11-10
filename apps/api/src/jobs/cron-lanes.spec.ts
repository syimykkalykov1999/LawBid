import { HEAVY_CRON_JOBS } from '../common/ops/ops.constants';
import {
  CRON_HEAVY_QUEUE,
  CRON_QUEUE,
  CRON_SCHEDULES,
  cronLaneOf,
} from './jobs.constants';
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

  it('the three moved jobs are on cron-heavy', () => {
    for (const n of [
      'search.trending-tags',
      'chat.search-backfill',
      'db.bloat-check',
    ]) {
      expect(cronLaneOf(n)).toBe(CRON_HEAVY_QUEUE);
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
