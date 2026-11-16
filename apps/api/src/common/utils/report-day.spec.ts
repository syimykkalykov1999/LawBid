import {
  DEFAULT_REPORT_TIME_ZONE,
  previousReportDay,
  reportDayBounds,
  reportDayKey,
  reportDayStart,
  reportTimeZone,
} from './report-day';

/** Owner 14.11 (row 180, B9): report days follow the owner's clock. */
describe('report days in the report time zone', () => {
  const LA = 'America/Los_Angeles';

  it('5 pm in Nevada (00:00 UTC next day) is still the same local day', () => {
    const at = new Date('2026-11-14T01:00:00Z'); // 13.11 17:00 PST
    expect(reportDayKey(at, LA)).toBe('2026-11-13');
    expect(reportDayKey(at, 'UTC')).toBe('2026-11-14');
    expect(reportDayStart(at, LA).toISOString()).toBe(
      '2026-11-13T08:00:00.000Z',
    );
  });

  it('a local day is 23 or 25 hours across a clock change', () => {
    const spring = reportDayBounds('2026-03-08', LA);
    expect(spring.from.toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(spring.to.toISOString()).toBe('2026-03-09T07:00:00.000Z');
    const fall = reportDayBounds('2026-11-01', LA);
    expect(fall.to.getTime() - fall.from.getTime()).toBe(25 * 3_600_000);
  });

  it('the previous complete local day', () => {
    // 27.10 09:10 UTC = 27.10 02:10 PDT → yesterday is the 26th.
    expect(previousReportDay(new Date('2026-10-27T09:10:00Z'), LA)).toBe(
      '2026-10-26',
    );
    expect(previousReportDay(new Date('2026-03-01T00:30:00Z'), 'UTC')).toBe(
      '2026-02-28',
    );
  });

  it('reads the setting; a missing or unknown zone falls back to the default', async () => {
    const of = (v: unknown) => ({ string: jest.fn(() => Promise.resolve(v)) });
    expect(await reportTimeZone(of('Europe/Moscow') as never)).toBe(
      'Europe/Moscow',
    );
    expect(await reportTimeZone(of('Mars/Base') as never)).toBe(
      DEFAULT_REPORT_TIME_ZONE,
    );
    expect(await reportTimeZone(undefined)).toBe(DEFAULT_REPORT_TIME_ZONE);
    expect(DEFAULT_REPORT_TIME_ZONE).toBe(LA);
  });
});
