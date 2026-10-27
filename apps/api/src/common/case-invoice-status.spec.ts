import {
  balanceCents,
  becomesOverdue,
  dueReminder,
  lateFeeFor,
  statusAfterPayment,
} from './case-invoice-status';

const m = (paidCents: number, lateFeeCents = 0) => ({
  totalCents: 10_000,
  lateFeeCents,
  paidCents,
});
const at = (s: string) => new Date(s);

describe('case invoice status', () => {
  it('balance counts the late fee and never goes negative', () => {
    expect(balanceCents(m(0, 500))).toBe(10_500);
    expect(balanceCents(m(20_000))).toBe(0);
  });

  it('a partial payment makes it partially paid, a full one paid', () => {
    expect(statusAfterPayment('sent', m(4000))).toBe('partially_paid');
    expect(statusAfterPayment('overdue', m(10_000))).toBe('paid');
    expect(statusAfterPayment('overdue', m(10_000, 500))).toBe(
      'partially_paid',
    );
  });

  it('void and draft never change by a payment', () => {
    expect(statusAfterPayment('void', m(10_000))).toBe('void');
    expect(statusAfterPayment('draft', m(10_000))).toBe('draft');
  });

  it('overdue only for an open invoice past its due date', () => {
    const now = at('2026-11-10T00:00:00Z');
    const due = at('2026-11-01T00:00:00Z');
    expect(becomesOverdue('sent', due, m(0), now)).toBe(true);
    expect(becomesOverdue('viewed', due, m(3000), now)).toBe(true);
    expect(becomesOverdue('paid', due, m(10_000), now)).toBe(false);
    expect(becomesOverdue('draft', due, m(0), now)).toBe(false);
    expect(becomesOverdue('sent', null, m(0), now)).toBe(false);
    expect(becomesOverdue('sent', at('2026-11-20T00:00:00Z'), m(0), now)).toBe(
      false,
    );
  });

  it('late fee is off at 0 and floors to whole cents', () => {
    expect(lateFeeFor(10_000, 0)).toBe(0);
    expect(lateFeeFor(10_001, 1.5)).toBe(150);
    expect(lateFeeFor(10_000, 500)).toBe(10_000);
  });

  describe('reminders', () => {
    const base = {
      dueAt: at('2026-11-10T12:00:00Z'),
      lastRemindedAt: null,
      remindersSent: 0,
      beforeDays: [3, 0],
      overdueEveryDays: 7,
      maxReminders: 6,
    };
    it('fires 3 days before and on the due day only', () => {
      expect(dueReminder({ ...base, now: at('2026-11-07T09:00:00Z') })).toBe(
        'invoice_reminder',
      );
      expect(
        dueReminder({ ...base, now: at('2026-11-08T09:00:00Z') }),
      ).toBeNull();
      expect(dueReminder({ ...base, now: at('2026-11-10T09:00:00Z') })).toBe(
        'invoice_reminder',
      );
    });
    it('overdue repeats every N days and stops at the cap', () => {
      const lastRemindedAt = at('2026-11-11T09:00:00Z');
      expect(
        dueReminder({
          ...base,
          lastRemindedAt,
          now: at('2026-11-15T09:00:00Z'),
        }),
      ).toBeNull();
      expect(
        dueReminder({
          ...base,
          lastRemindedAt,
          now: at('2026-11-18T09:00:00Z'),
        }),
      ).toBe('invoice_overdue');
      expect(
        dueReminder({
          ...base,
          remindersSent: 6,
          now: at('2026-11-18T09:00:00Z'),
        }),
      ).toBeNull();
    });
    it('never twice in a day', () => {
      expect(
        dueReminder({
          ...base,
          lastRemindedAt: at('2026-11-10T08:00:00Z'),
          now: at('2026-11-10T09:00:00Z'),
        }),
      ).toBeNull();
    });
  });
});
