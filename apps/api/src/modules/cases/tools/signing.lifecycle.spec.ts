import {
  isExpired,
  parseViewLog,
  signReminderDue,
  VIEW_LOG_MAX,
  withView,
  type ViewEntry,
} from './signing.lifecycle';

const v = (userId: string, at: string): ViewEntry => ({
  userId,
  role: 'client',
  at,
  ip: null,
});

describe('signing lifecycle', () => {
  it('expires at the expiry instant, never when none is set', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(new Date('2026-11-01T00:00:00Z'), now)).toBe(true);
    expect(isExpired(new Date('2026-11-02T00:00:00Z'), now)).toBe(false);
  });

  it('first view is flagged, a reopen within 10 minutes is not logged', () => {
    const a = withView([], v('u1', '2026-11-01T10:00:00Z'));
    expect(a?.first).toBe(true);
    const again = withView(a!.log, v('u1', '2026-11-01T10:05:00Z'));
    expect(again).toBeNull();
    const later = withView(a!.log, v('u1', '2026-11-01T10:20:00Z'));
    expect(later?.first).toBe(false);
    expect(later?.log).toHaveLength(2);
  });

  it('another person is a separate first view', () => {
    const a = withView(
      [v('u1', '2026-11-01T10:00:00Z')],
      v('u2', '2026-11-01T10:01:00Z'),
    );
    expect(a?.first).toBe(true);
  });

  it('keeps only the latest views', () => {
    let log: ViewEntry[] = [];
    for (let i = 0; i < VIEW_LOG_MAX + 5; i++) {
      const t = new Date(Date.UTC(2026, 10, 1, 0, i * 20)).toISOString();
      log = withView(log, v('u1', t))!.log;
    }
    expect(log).toHaveLength(VIEW_LOG_MAX);
  });

  it('reads garbage from the database as an empty log', () => {
    expect(parseViewLog(null)).toEqual([]);
    expect(parseViewLog([{ nope: 1 }, v('u1', 'x')])).toHaveLength(1);
  });

  it('reminders: off at 0, spaced by days, capped', () => {
    const base = {
      now: new Date('2026-11-10T00:00:00Z'),
      createdAt: new Date('2026-11-01T00:00:00Z'),
      lastRemindedAt: null,
      remindersSent: 0,
      everyDays: 3,
      max: 3,
    };
    expect(signReminderDue({ ...base, everyDays: 0 })).toBe(false);
    expect(signReminderDue(base)).toBe(true);
    expect(
      signReminderDue({
        ...base,
        lastRemindedAt: new Date('2026-11-09T00:00:00Z'),
      }),
    ).toBe(false);
    expect(signReminderDue({ ...base, remindersSent: 3 })).toBe(false);
  });
});
