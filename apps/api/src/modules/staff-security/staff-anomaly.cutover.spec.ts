import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffAnomaliesJob } from '../../jobs/handlers/staff-anomalies.job';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAnomalyService } from './staff-anomaly.service';
import { dayKey, StaffCardWatch } from './staff-card-watch';

/**
 * Row 180 follow-up B9: the staff-security anomaly days (the detector's
 * Redis day counters and the nightly report) follow `admin.report_timezone`
 * like the rest of the admin. Across the switch from the old UTC days every
 * opened card is counted in exactly one day, and every day is reported
 * after its last count (none skipped).
 */
describe('anomaly days across the switch from UTC to the report time zone', () => {
  const H = 3_600_000;

  function world() {
    const hashes = new Map<string, Record<string, string>>();
    const hincr = (h: string, f: string, n: number) => {
      const row = hashes.get(h) ?? {};
      row[f] = String(Number(row[f] ?? 0) + n);
      hashes.set(h, row);
      return Number(row[f]);
    };
    const redis = {
      multi: () => {
        const ops: Array<() => unknown> = [];
        const chain = {
          incr: () => {
            ops.push(() => 1);
            return chain;
          },
          hincrby: (h: string, f: string, n: number) => {
            ops.push(() => hincr(h, f, n));
            return chain;
          },
          expire: () => {
            ops.push(() => 1);
            return chain;
          },
          exec: () => Promise.resolve(ops.map((op) => [null, op()])),
        };
        return chain;
      },
      hincrby: (h: string, f: string, n: number) =>
        Promise.resolve(hincr(h, f, n)),
      hgetall: (h: string) => Promise.resolve({ ...(hashes.get(h) ?? {}) }),
    };
    const stored: Record<string, unknown> = {
      'staff.anomalies_enabled': true,
      'admin.report_timezone': 'UTC',
    };
    const staff = new StaffSettingsService({
      all: () => Promise.resolve(stored),
    } as unknown as AppSettingsService);
    const appSettings = {
      string: () => Promise.resolve(stored['admin.report_timezone'] as string),
    };
    const watch = new StaffCardWatch(
      redis as never,
      { workLease: { findFirst: jest.fn() } } as never,
      staff,
      appSettings as never,
    );
    const upsert = jest.fn().mockResolvedValue(undefined);
    const anomalies = new StaffAnomalyService(
      watch,
      { staffAnomaly: { upsert } } as never,
      staff,
    );
    const reported: Array<{ day: string; opened: number }> = [];
    const compute = anomalies.computeDay.bind(anomalies);
    jest.spyOn(anomalies, 'computeDay').mockImplementation(async (day) => {
      const c = (await watch.readDay(day)).get('a');
      reported.push({ day, opened: c?.opened ?? 0 });
      return compute(day);
    });
    const job = new StaffAnomaliesJob(staff, anomalies, appSettings as never);
    const opened = (day: string) =>
      Number(hashes.get(dayKey(day))?.['a:opened'] ?? 0);
    return { stored, watch, job, reported, opened };
  }

  afterEach(() => jest.useRealTimers());

  it('old runs (02:25 UTC), the deploy, new runs (10:25 UTC): each card once, each day reported complete', async () => {
    const { stored, watch, job, reported, opened } = world();
    jest.useFakeTimers();
    const runs = new Set<number>([
      // old cron, UTC days
      Date.parse('2026-11-11T02:25:00Z'),
      Date.parse('2026-11-12T02:25:00Z'),
      // new cron after the deploy
      ...[12, 13, 14, 15].map((d) => Date.parse(`2026-11-${d}T10:25:00Z`)),
    ]);
    const deploy = Date.parse('2026-11-12T05:00:00Z');
    let cards = 0;
    for (
      let t = Date.parse('2026-11-10T00:00:00Z');
      t < Date.parse('2026-11-16T00:00:00Z');
      t += H / 4 // every 15 minutes: a card at :30, a run when due
    ) {
      jest.setSystemTime(t);
      if (t === deploy) stored['admin.report_timezone'] = 'America/Los_Angeles';
      for (const r of runs) {
        if (r > t - H / 4 && r <= t) await job.run(new Date(r));
      }
      if (t % H === H / 2) {
        await watch.noteOpened('a', { area: 'users', id: `c${t}` });
        cards += 1;
      }
    }
    const days = [...new Set(reported.map((r) => r.day))];
    // no day skipped
    expect(days).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
    // each day's LAST report saw every card of that day
    for (const d of days) {
      const last = reported.filter((r) => r.day === d).pop()!;
      expect(last.opened).toBe(opened(d));
    }
    // every card is in exactly one day
    const all = [
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ];
    expect(all.reduce((s, d) => s + opened(d), 0)).toBe(cards);
    // Nevada days after the switch: 03:30 UTC on the 14th is the 13th there
    expect(opened('2026-11-13')).toBe(24);
    // the switch: the 11th got 3 more cards (05:30–07:30 UTC on the 12th,
    // still the 11th in Nevada) and was reported again with them
    expect(opened('2026-11-11')).toBe(27);
    expect(reported.filter((r) => r.day === '2026-11-11')).toHaveLength(2);
  });
});
