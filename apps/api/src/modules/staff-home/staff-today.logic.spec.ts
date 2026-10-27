import type { TodayBlocks } from './staff-today.logic';
import { pickDecisionOfDay } from './staff-today.logic';
import type { StaffTodaySuggestionDto } from './staff-home.dto';

const rec = {
  advice: 'replace',
  adviceLabel: 'Заменить',
  actionLabel: 'x',
  headline: 'Стоит заменить.',
  lines: [],
};
const sug = (kind: string, name = 'Иван'): StaffTodaySuggestionDto => ({
  id: 's1',
  adminId: 'a1',
  name,
  workspace: 'mass',
  kind,
  createdAt: '2026-10-27T00:00:00.000Z',
  recommendation: rec,
});
const none: TodayBlocks = {
  appeals: null,
  flags: null,
  suggestions: null,
  anomalies: null,
  piecework: null,
};

describe('pickDecisionOfDay (one decision a day, by priority)', () => {
  it('nothing to decide → null', () => {
    expect(pickDecisionOfDay(none)).toBeNull();
    expect(
      pickDecisionOfDay({
        ...none,
        appeals: { open: 0, newest: [] },
        flags: { open: 0 },
        suggestions: { open: 0, items: [] },
        anomalies: { day: null, total: 0, items: [] },
        piecework: { disputedDays: 0 },
      }),
    ).toBeNull();
  });

  it('a retaliation red mark beats everything', () => {
    const d = pickDecisionOfDay({
      ...none,
      flags: { open: 1 },
      appeals: { open: 3, newest: [] },
      suggestions: { open: 1, items: [sug('replace')] },
    });
    expect(d?.code).toBe('retaliation_flag');
  });

  it('then a complaint, then a removal suggestion, then held pay, then an anomaly, then a soft suggestion', () => {
    const base: TodayBlocks = {
      appeals: { open: 1, newest: [] },
      flags: { open: 0 },
      suggestions: { open: 2, items: [sug('warn'), sug('pull', 'Пётр')] },
      anomalies: {
        day: '2026-10-27',
        total: 1,
        items: [
          {
            adminId: 'a2',
            name: 'Анна',
            rule: 'too_fast',
            ruleLabel: 'решает слишком быстро',
            score: 9,
          },
        ],
      },
      piecework: { disputedDays: 2 },
    };
    expect(pickDecisionOfDay(base)?.code).toBe('appeal');
    expect(
      pickDecisionOfDay({ ...base, appeals: { open: 0, newest: [] } }),
    ).toMatchObject({
      code: 'suggestion_removal',
      href: '/staff/a1',
    });
    const noRemoval = {
      ...base,
      appeals: null,
      suggestions: { open: 1, items: [sug('warn')] },
    };
    expect(pickDecisionOfDay(noRemoval)?.code).toBe('piecework_disputed');
    expect(pickDecisionOfDay({ ...noRemoval, piecework: null })?.code).toBe(
      'anomaly',
    );
    expect(
      pickDecisionOfDay({ ...noRemoval, piecework: null, anomalies: null })
        ?.code,
    ).toBe('suggestion');
  });
});
