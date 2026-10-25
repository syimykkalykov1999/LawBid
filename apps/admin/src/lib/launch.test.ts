import { describe, expect, it } from 'vitest';
import {
  barHeights,
  budgetPercent,
  budgetTone,
  fixedFromDrafts,
  freeTierPercent,
  freeTierTone,
  groupItems,
  keepLine,
  launchSummary,
  money,
  newFixedId,
  parseLimit,
  type LaunchItem,
} from './launch';

const item = (id: string, group: LaunchItem['group']): LaunchItem => ({
  id,
  group,
  title: id,
  status: 'green',
  detail: '',
  hint: null,
  runbook: null,
  manualTick: false,
  ticked: false,
  action: null,
});

describe('launch helpers (owner 2026-10-24)', () => {
  it('groups the steps in server order with Russian titles', () => {
    const g = groupItems([item('a', 'release'), item('b', 'money'), item('c', 'release')]);
    expect(g.map((x) => [x.title, x.items.map((i) => i.id)])).toEqual([
      ['Выкат и домен', ['a', 'c']],
      ['Деньги', ['b']],
    ]);
  });

  it('says how many steps are done', () => {
    expect(launchSummary({ greenCount: 9, total: 16 })).toBe('Готово 9 из 16. Осталось 7.');
    expect(launchSummary({ greenCount: 3, total: 3 })).toBe('Всё готово: 3 из 3.');
  });

  it('reads a budget limit the way a person types it', () => {
    expect(parseLimit('150')).toBe(150);
    expect(parseLimit('$150,5')).toBe(150.5);
    expect(parseLimit(' 99.99 ')).toBe(99.99);
    expect(parseLimit('0')).toBeNull();
    expect(parseLimit('abc')).toBeNull();
    expect(parseLimit('1e5')).toBeNull();
    expect(parseLimit('100001')).toBeNull();
  });

  it('colours a budget by how much is spent', () => {
    expect(budgetPercent({ limitUsd: 200, actualUsd: 50 })).toBe(25);
    expect(budgetPercent({ limitUsd: null, actualUsd: 5 })).toBeNull();
    expect(budgetTone(25)).toBe('success');
    expect(budgetTone(85)).toBe('warning');
    expect(budgetTone(100)).toBe('danger');
    expect(budgetTone(null)).toBe('neutral');
  });

  it('formats money and admits missing data', () => {
    expect(money(null)).toBe('нет данных');
    expect(money(12)).toBe('$12');
    expect(money(12.5)).toBe('$12,50');
  });

  it('scales the 30-day bars to the biggest day, tiny days stay visible', () => {
    expect(barHeights([{ usd: 0 }, { usd: 10 }, { usd: 5 }, { usd: 0.01 }])).toEqual([0, 100, 50, 4]);
    expect(barHeights([{ usd: 0 }, { usd: 0 }])).toEqual([0, 0]);
  });

  it('free tier bar', () => {
    expect(freeTierPercent({ used: 250, free: 1000 })).toBe(25);
    expect(freeTierPercent(null)).toBeNull();
    expect(freeTierTone(25)).toBe('success');
    expect(freeTierTone(75)).toBe('warning');
    expect(freeTierTone(120)).toBe('danger');
  });

  it('turns the editable fixed-cost rows into an API body, null while a row is wrong', () => {
    expect(
      fixedFromDrafts([
        { id: 'c1', label: ' Apple ', usd: '99', period: 'year', paidMonth: '' },
        { id: 'c2', label: 'Google', usd: '25,5', period: 'once', paidMonth: '2026-10' },
      ]),
    ).toEqual({
      items: [
        { id: 'c1', label: 'Apple', usd: 99, period: 'year' },
        { id: 'c2', label: 'Google', usd: 25.5, period: 'once', paidMonth: '2026-10' },
      ],
    });
    expect(fixedFromDrafts([{ id: 'c1', label: '', usd: '1', period: 'month', paidMonth: '' }])).toBeNull();
    expect(fixedFromDrafts([{ id: 'c1', label: 'x', usd: 'many', period: 'month', paidMonth: '' }])).toBeNull();
    expect(fixedFromDrafts([{ id: 'c1', label: 'x', usd: '1', period: 'once', paidMonth: '' }])).toBeNull();
    expect(newFixedId([{ id: 'c1' }, { id: 'c2' }])).toBe('c3');
  });

  it('the «keep on the account» sentence names forecast, margin and total', () => {
    const t = {
      monthToDateUsd: 10,
      forecastUsd: 100,
      marginPercent: 20,
      keepOnAccountUsd: 120,
      fixedMonthUsd: 0,
      stripeFeesUsd: null,
    };
    expect(keepLine(t)).toBe('Прогноз счетов за месяц $100 плюс запас 20%: держите на счету около $120.');
  });
});
