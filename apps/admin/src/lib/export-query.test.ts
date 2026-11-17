import { describe, expect, it } from 'vitest';
import { exportSearch } from '@/components/csv-button';
import { casePaymentsCsvQuery, paymentsCsvQuery } from './export-query';

/** Row 180 follow-up B7: the money CSVs carry the list filters. */
describe('CSV of the money lists', () => {
  const U = '11111111-1111-4111-8111-111111111111';

  it('payments: status and the date window of the Payments tab', () => {
    const q = paymentsCsvQuery('payments', 'failed', '2026-11-01', '2026-11-07');
    expect(q?.status).toBe('failed');
    expect(q?.from).toBe(new Date('2026-11-01T00:00:00').toISOString());
    expect(q?.to).toBe(new Date('2026-11-08T00:00:00').toISOString());
    expect(exportSearch(q)).toContain('status=failed');
  });

  it('payments: another tab or a bad date in the address is not a filter', () => {
    expect(paymentsCsvQuery('refunds', 'failed', '2026-11-01', '')).toBeUndefined();
    expect(exportSearch(paymentsCsvQuery('payments', '', 'garbage', '2026-13'))).toBe('');
  });

  it('case payments: status, «Споры» → disputed, person and case', () => {
    expect(exportSearch(casePaymentsCsvQuery('payments', 'refunded', U, U))).toBe(`?status=refunded&userId=${U}&caseId=${U}`);
    expect(exportSearch(casePaymentsCsvQuery('payments', 'disputes', '', ''))).toBe('?disputed=true');
    expect(exportSearch(casePaymentsCsvQuery('payments', 'all', 'half-typed', ''))).toBe('');
    expect(casePaymentsCsvQuery('accounts', 'refunded', U, U)).toBeUndefined();
  });
});
