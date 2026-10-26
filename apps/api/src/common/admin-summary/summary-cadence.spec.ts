import { adminSummariesDue } from './summary-cadence';

const now = new Date('2026-10-25T12:00:00Z');
const ago = (min: number) =>
  new Date(now.getTime() - min * 60_000).toISOString();

describe('adminSummariesDue (S20-1)', () => {
  it('on: every tick', () => {
    expect(
      adminSummariesDue({
        mode: 'on',
        adminActive: false,
        lastRunAt: ago(0.5),
        now,
      }),
    ).toBe(true);
  });
  it('auto + admin active: every tick', () => {
    expect(
      adminSummariesDue({
        mode: 'auto',
        adminActive: true,
        lastRunAt: ago(1),
        now,
      }),
    ).toBe(true);
  });
  it('auto + nobody there: hourly', () => {
    const idle = { mode: 'auto', adminActive: false, now } as const;
    expect(adminSummariesDue({ ...idle, lastRunAt: ago(2) })).toBe(false);
    expect(adminSummariesDue({ ...idle, lastRunAt: ago(59) })).toBe(false);
    expect(adminSummariesDue({ ...idle, lastRunAt: ago(60) })).toBe(true);
  });
  it('off: every 6 hours, even when an admin is active', () => {
    const off = { mode: 'off', adminActive: true, now } as const;
    expect(adminSummariesDue({ ...off, lastRunAt: ago(120) })).toBe(false);
    expect(adminSummariesDue({ ...off, lastRunAt: ago(360) })).toBe(true);
  });
  it('never run or a broken stamp: run', () => {
    expect(
      adminSummariesDue({
        mode: 'off',
        adminActive: false,
        lastRunAt: null,
        now,
      }),
    ).toBe(true);
    expect(
      adminSummariesDue({
        mode: 'off',
        adminActive: false,
        lastRunAt: 'junk',
        now,
      }),
    ).toBe(true);
  });
});
