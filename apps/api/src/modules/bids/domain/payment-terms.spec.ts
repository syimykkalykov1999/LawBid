import {
  describePaymentTerms,
  isValidPaymentTerms,
  normalizePaymentTerms,
  paymentTermsProblems,
  type PaymentTerms,
} from './payment-terms';

const base = { version: 1, currency: 'USD' as const };

describe('paymentTermsProblems', () => {
  it('accepts each type with its required fields', () => {
    const ok: PaymentTerms[] = [
      { ...base, type: 'flat', flatCents: 250_000 },
      {
        ...base,
        type: 'hourly',
        hourlyRateCents: 35_000,
        estimatedHoursMin: 10,
        estimatedHoursMax: 20,
      },
      { ...base, type: 'contingency_pct', contingencyBps: 3333 },
      {
        ...base,
        type: 'retainer_plus_installments',
        retainerCents: 300_000,
        installmentCents: 50_000,
        installmentCount: 10,
        installmentPeriod: 'monthly',
      },
      {
        ...base,
        type: 'mixed',
        retainerCents: 100_000,
        hourlyRateCents: 30_000,
      },
      { ...base, type: 'to_be_clarified', notes: 'After document review.' },
    ];
    for (const t of ok) expect(paymentTermsProblems(t)).toEqual([]);
  });

  it('rejects non-objects, wrong version, wrong currency, unknown fields', () => {
    expect(paymentTermsProblems(null)).toEqual([
      'paymentTerms must be an object',
    ]);
    expect(paymentTermsProblems([])).toHaveLength(1);
    expect(
      paymentTermsProblems({ ...base, version: 2, type: 'flat', flatCents: 1 }),
    ).toContain('version must be 1');
    expect(
      paymentTermsProblems({
        version: 1,
        currency: 'EUR',
        type: 'flat',
        flatCents: 1,
      }),
    ).toContain('currency must be USD');
    expect(
      paymentTermsProblems({ ...base, type: 'flat', flatCents: 1, extra: 1 }),
    ).toContain('unknown field extra');
  });

  it('rejects an unknown type and stops there', () => {
    expect(paymentTermsProblems({ ...base, type: 'barter' })).toEqual([
      'type is not one of the payment term types',
    ]);
  });

  it('checks integer ranges', () => {
    expect(
      paymentTermsProblems({ ...base, type: 'flat', flatCents: 12.5 }),
    ).toContain('flatCents must be an integer 1..1000000000');
    expect(
      paymentTermsProblems({ ...base, type: 'flat', flatCents: 0 }),
    ).toContain('flatCents must be an integer 1..1000000000');
    expect(
      paymentTermsProblems({
        ...base,
        type: 'contingency_pct',
        contingencyBps: 10_001,
      }),
    ).toContain('contingencyBps must be an integer 1..10000');
    expect(
      paymentTermsProblems({
        ...base,
        type: 'retainer_plus_installments',
        retainerCents: 1,
        installmentCents: 1,
        installmentCount: 121,
        installmentPeriod: 'monthly',
      }),
    ).toContain('installmentCount must be an integer 1..120');
  });

  it('requires the fields of the type and forbids the others', () => {
    expect(paymentTermsProblems({ ...base, type: 'flat' })).toContain(
      'flat needs flatCents',
    );
    expect(
      paymentTermsProblems({
        ...base,
        type: 'flat',
        flatCents: 1,
        contingencyBps: 10,
      }),
    ).toContain('flat must not have contingencyBps');
    expect(
      paymentTermsProblems({ ...base, type: 'to_be_clarified', flatCents: 1 }),
    ).toContain('to_be_clarified must not have flatCents');
    expect(paymentTermsProblems({ ...base, type: 'mixed' })).toContain(
      'mixed needs at least one amount',
    );
    expect(
      paymentTermsProblems({
        ...base,
        type: 'retainer_plus_installments',
        retainerCents: 1,
      }),
    ).toEqual(
      expect.arrayContaining([
        'retainer_plus_installments needs installmentCents',
        'retainer_plus_installments needs installmentCount',
        'retainer_plus_installments needs installmentPeriod',
      ]),
    );
  });

  it('keeps installment fields together and hours with a rate', () => {
    expect(
      paymentTermsProblems({
        ...base,
        type: 'mixed',
        flatCents: 1,
        installmentCents: 5,
      }),
    ).toContain(
      'installmentCents, installmentCount and installmentPeriod go together',
    );
    expect(
      paymentTermsProblems({
        ...base,
        type: 'mixed',
        flatCents: 1,
        estimatedHoursMax: 5,
      }),
    ).toContain('estimated hours need hourlyRateCents');
    expect(
      paymentTermsProblems({
        ...base,
        type: 'hourly',
        hourlyRateCents: 100,
        estimatedHoursMin: 9,
        estimatedHoursMax: 3,
      }),
    ).toContain('estimatedHoursMin must not exceed estimatedHoursMax');
  });

  it('limits notes and the installment period', () => {
    expect(
      paymentTermsProblems({
        ...base,
        type: 'to_be_clarified',
        notes: 'x'.repeat(1001),
      }),
    ).toContain('notes must be a string up to 1000');
    expect(
      paymentTermsProblems({
        ...base,
        type: 'retainer_plus_installments',
        retainerCents: 1,
        installmentCents: 1,
        installmentCount: 2,
        installmentPeriod: 'daily',
      }),
    ).toContain('installmentPeriod must be weekly, monthly or quarterly');
  });
});

describe('normalizePaymentTerms / describePaymentTerms', () => {
  it('drops empty fields and sorts keys', () => {
    const n = normalizePaymentTerms({
      ...base,
      type: 'flat',
      flatCents: 100,
      notes: '',
      hourlyRateCents: undefined,
    });
    expect(Object.keys(n)).toEqual([
      'currency',
      'flatCents',
      'type',
      'version',
    ]);
    expect(isValidPaymentTerms(n)).toBe(true);
  });

  it('prints one plain line per term, notes verbatim', () => {
    expect(
      describePaymentTerms({
        ...base,
        type: 'retainer_plus_installments',
        retainerCents: 300_000,
        installmentCents: 50_000,
        installmentCount: 10,
        installmentPeriod: 'monthly',
        notes: 'Court fees at cost — счёт отдельно.',
      }),
    ).toEqual([
      'Retainer $3,000.00.',
      '10 monthly payments of $500.00 (total $5,000.00).',
      'Notes: Court fees at cost — счёт отдельно.',
    ]);
    expect(
      describePaymentTerms({
        ...base,
        type: 'hourly',
        hourlyRateCents: 35_000,
        estimatedHoursMin: 10,
        estimatedHoursMax: 20,
      }),
    ).toEqual(['Hourly rate $350.00 per hour, about 10–20 hours.']);
    expect(
      describePaymentTerms({
        ...base,
        type: 'contingency_pct',
        contingencyBps: 3333,
      }),
    ).toEqual(['Contingency fee 33.33 % of the recovery.']);
    expect(describePaymentTerms({ ...base, type: 'to_be_clarified' })).toEqual([
      'Payment terms to be clarified between the parties.',
    ]);
  });
});
