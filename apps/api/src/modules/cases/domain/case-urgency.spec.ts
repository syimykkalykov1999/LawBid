import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateCaseUrgencyDto } from '../dto/case-requests.dto';
import {
  daysUntil,
  effectiveUrgency,
  levelForDays,
  parseIsoDate,
  resolveUrgencyInput,
  UrgencyInputError,
  urgencyFields,
} from './case-urgency';

describe('case urgency: a level or a date (owner 2026-10-05)', () => {
  const now = new Date('2026-10-05T18:00:00Z');
  const d = (s: string) => parseIsoDate(s)!;

  it('counts calendar days in UTC', () => {
    expect(daysUntil(d('2026-10-05'), now)).toBe(0);
    expect(daysUntil(d('2026-10-06'), now)).toBe(1);
    expect(daysUntil(d('2026-10-04'), now)).toBe(-1);
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('05.10.2026')).toBeNull();
  });

  it('turns days left into a level (defaults 1 / 3 / 7 / 31)', () => {
    expect(levelForDays(-1)).toBe('overdue');
    expect(levelForDays(0)).toBe('very_urgent');
    expect(levelForDays(1)).toBe('very_urgent');
    expect(levelForDays(3)).toBe('urgent');
    expect(levelForDays(7)).toBe('soon');
    expect(levelForDays(20)).toBe('within_month');
    expect(levelForDays(90)).toBe('flexible');
    expect(
      levelForDays(10, { veryUrgent: 2, urgent: 5, soon: 14, withinMonth: 60 }),
    ).toBe('soon');
  });

  it('a chosen level reads as itself, a date by its days left', () => {
    expect(effectiveUrgency('urgent', null, now)).toBe('urgent');
    expect(effectiveUrgency(null, null, now)).toBeNull();
    expect(effectiveUrgency('by_date', d('2026-10-07'), now)).toBe('urgent');
    expect(
      urgencyFields(
        {
          urgency: 'by_date',
          deadline_at: d('2026-10-06'),
          deadline_kind: 'court_hearing',
        },
        now,
      ),
    ).toEqual({
      urgency: 'by_date',
      urgencyLevel: 'very_urgent',
      deadlineAt: '2026-10-06',
      deadlineKind: 'court_hearing',
    });
  });

  it('a date alone means by_date; a level clears the date and its kind', () => {
    expect(
      resolveUrgencyInput(
        { deadlineAt: '2026-11-03', deadlineKind: 'court_hearing' },
        null,
        now,
      ),
    ).toEqual({
      urgency: 'by_date',
      deadline_at: d('2026-11-03'),
      deadline_kind: 'court_hearing',
    });
    expect(
      resolveUrgencyInput(
        { urgency: 'very_urgent' },
        {
          urgency: 'by_date',
          deadline_at: d('2026-11-03'),
          deadline_kind: 'court_hearing',
        },
        now,
      ),
    ).toEqual({
      urgency: 'very_urgent',
      deadline_at: null,
      deadline_kind: null,
    });
    expect(
      resolveUrgencyInput(
        { deadlineAt: null },
        {
          urgency: 'by_date',
          deadline_at: d('2026-11-03'),
          deadline_kind: null,
        },
        now,
      ),
    ).toEqual({ urgency: null, deadline_at: null, deadline_kind: null });
  });

  it('refuses by_date without a date, a past date and one years ahead', () => {
    expect(() =>
      resolveUrgencyInput({ urgency: 'by_date' }, null, now),
    ).toThrow(UrgencyInputError);
    expect(() =>
      resolveUrgencyInput({ deadlineAt: '2026-10-01' }, null, now),
    ).toThrow(UrgencyInputError);
    expect(() =>
      resolveUrgencyInput({ deadlineAt: '2029-01-01' }, null, now),
    ).toThrow(UrgencyInputError);
    // The Dart client sends a date-time; its date part counts.
    expect(
      resolveUrgencyInput({ deadlineAt: '2026-11-03T00:00:00.000' }, null, now)
        .deadline_at,
    ).toEqual(d('2026-11-03'));
    // A day of slack for the client's time zone.
    expect(
      resolveUrgencyInput({ deadlineAt: '2026-10-04' }, null, now).deadline_at,
    ).toEqual(d('2026-10-04'));
  });

  it('validates the request body', () => {
    const errors = (body: object): string[] =>
      validateSync(plainToInstance(UpdateCaseUrgencyDto, body)).map(
        (e) => e.property,
      );
    expect(
      errors({ deadlineAt: '2026-11-03', deadlineKind: 'filing_deadline' }),
    ).toEqual([]);
    expect(errors({ urgency: 'within_month' })).toEqual([]);
    expect(errors({ urgency: 'by_date', deadlineAt: null })).toEqual([]);
    expect(errors({ deadlineAt: '2026-11-03T00:00:00.000' })).toEqual([]);
    expect(errors({ deadlineAt: 'tomorrow' })).toEqual(['deadlineAt']);
    expect(errors({ deadlineKind: 'trial' })).toEqual(['deadlineKind']);
  });
});
