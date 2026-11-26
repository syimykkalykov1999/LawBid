import { CasePaymentsService } from './case-payments.service';

/**
 * ASVS 5.0 V1.2.10 (STAGE2_SECURITY #10): the user's own payments export
 * opens in Excel. Case titles, notes and the other side's name are user
 * text, so a title like `=HYPERLINK("http://x")` must come out as text,
 * not as a live formula (before 25.11 the cells were only quoted).
 */
describe('payments CSV export: formula injection', () => {
  function service(item: Record<string, unknown>) {
    const svc = Object.create(
      CasePaymentsService.prototype,
    ) as CasePaymentsService;
    const row = { stripe_payment_intent_id: '@pi_test' };
    Object.assign(svc, {
      prisma: { casePayment: { findMany: () => Promise.resolve([row]) } },
      mine: () => ({}),
      settings: () => Promise.resolve({}),
      present: () =>
        Promise.resolve([
          {
            id: 'p1',
            paidAt: '2026-11-25T00:00:00.000Z',
            createdAt: '2026-11-25T00:00:00.000Z',
            kind: 'retainer',
            status: 'paid',
            amountCents: 10000,
            platformFeeCents: 0,
            processingFeeCents: 0,
            clientTotalCents: 10000,
            attorneyNetCents: 10000,
            refundedCents: 0,
            ...item,
          },
        ]),
    });
    return svc;
  }

  it('a case title, note and name that start a formula are shown as text', async () => {
    const csv = await service({
      caseTitle: '=HYPERLINK("http://x","click")',
      note: '+1-1',
      attorney: { name: '-2+3', username: null },
    }).exportCsv({ sub: 'u1', role: 'client' } as never, {});
    const line = csv.split('\r\n')[1];
    expect(line).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(line).toContain(`"'+1-1"`);
    expect(line).toContain(`"'-2+3"`);
    expect(line).toContain(`"'@pi_test"`);
    // Amounts stay numbers.
    expect(line).toContain(',100.00,');
  });

  it('ordinary text is unchanged', async () => {
    const csv = await service({
      caseTitle: 'Divorce, Smith',
      note: null,
      attorney: { name: 'Anna "A" Lee', username: null },
    }).exportCsv({ sub: 'u1', role: 'client' } as never, {});
    const line = csv.split('\r\n')[1];
    expect(line).toContain('"Divorce, Smith"');
    expect(line).toContain('"Anna ""A"" Lee"');
  });
});
