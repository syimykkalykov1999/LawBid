import { describe, expect, it } from 'vitest';
import { cancelSummary } from '@/components/billing/subscription-actions';

describe('cancelSummary', () => {
  it('keeps access until the period end', () => {
    expect(cancelSummary('period_end', 'none', '2026-11-01T00:00:00Z')).toMatch(/^Доступ останется до /);
    expect(cancelSummary('period_end', 'full', null)).toMatch(/не продлится/);
  });
  it('names the refund when cancelling now', () => {
    expect(cancelSummary('now', 'none', null)).toMatch(/закроется сразу.*не возвращаем/);
    expect(cancelSummary('now', 'prorated', null)).toMatch(/неиспользованные дни/);
    expect(cancelSummary('now', 'full', null)).toMatch(/вернём полностью/);
  });
});
