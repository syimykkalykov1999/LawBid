import {
  buildEvidenceFields,
  disputeOpen,
  disputeRate,
  efwAutoRefund,
  evidenceDocumentLines,
  reminderBucket,
  reminderDue,
  slaDueAt,
  slaState,
  type EvidenceFacts,
} from './stripe-ops.helpers';

const DAY = 86_400_000;
const at = (s: string) => new Date(s);

describe('review SLA', () => {
  it('slaDueAt adds the hours (at least one)', () => {
    expect(slaDueAt(at('2026-10-27T00:00:00Z'), 24).toISOString()).toBe(
      '2026-10-28T00:00:00.000Z',
    );
    expect(slaDueAt(at('2026-10-27T00:00:00Z'), 0).toISOString()).toBe(
      '2026-10-27T01:00:00.000Z',
    );
  });

  it('ok -> due_soon in the last quarter -> overdue', () => {
    const opened = at('2026-10-27T00:00:00Z');
    const due = at('2026-10-28T00:00:00Z');
    expect(slaState(opened, due, at('2026-10-27T10:00:00Z'))).toBe('ok');
    expect(slaState(opened, due, at('2026-10-27T19:00:00Z'))).toBe('due_soon');
    expect(slaState(opened, due, at('2026-10-28T00:00:01Z'))).toBe('overdue');
    expect(slaState(opened, null, at('2030-01-01T00:00:00Z'))).toBe('ok');
  });
});

describe('dispute deadline reminders', () => {
  const due = at('2026-11-10T00:00:00Z');
  const days = [5, 2, 1];

  it('buckets by days left', () => {
    expect(reminderBucket(due, at('2026-11-01T00:00:00Z'), days)).toBeNull();
    expect(reminderBucket(due, at('2026-11-05T12:00:00Z'), days)).toBe(5);
    expect(reminderBucket(due, at('2026-11-08T12:00:00Z'), days)).toBe(2);
    expect(reminderBucket(due, at('2026-11-09T12:00:00Z'), days)).toBe(1);
    expect(reminderBucket(due, at('2026-11-10T01:00:00Z'), days)).toBe(0);
  });

  it('reminds once per bucket', () => {
    const now = at('2026-11-05T12:00:00Z');
    expect(reminderDue({ dueAt: due, now, remindedAt: null, days })).toBe(true);
    // already reminded in the same bucket
    expect(
      reminderDue({
        dueAt: due,
        now: at('2026-11-05T20:00:00Z'),
        remindedAt: now,
        days,
      }),
    ).toBe(false);
    // next bucket reminds again
    expect(
      reminderDue({
        dueAt: due,
        now: at('2026-11-08T12:00:00Z'),
        remindedAt: now,
        days,
      }),
    ).toBe(true);
    // too early
    expect(
      reminderDue({
        dueAt: due,
        now: new Date(due.getTime() - 20 * DAY),
        remindedAt: null,
        days,
      }),
    ).toBe(false);
  });
});

describe('dispute rate', () => {
  const cfg = { warnPercent: 0.5, alarmPercent: 1, minCount: 3 };
  it('ok / warn / alarm by percent', () => {
    expect(disputeRate({ disputes: 3, payments: 1000, ...cfg })).toMatchObject({
      ratePercent: 0.3,
      level: 'ok',
    });
    expect(disputeRate({ disputes: 6, payments: 1000, ...cfg })).toMatchObject({
      ratePercent: 0.6,
      level: 'warn',
    });
    expect(disputeRate({ disputes: 15, payments: 1000, ...cfg })).toMatchObject(
      { ratePercent: 1.5, level: 'alarm' },
    );
  });
  it('stays ok below the minimum count or with no payments', () => {
    expect(disputeRate({ disputes: 2, payments: 10, ...cfg }).level).toBe('ok');
    expect(disputeRate({ disputes: 0, payments: 0, ...cfg })).toMatchObject({
      ratePercent: 0,
      level: 'ok',
    });
  });
});

describe('early fraud warning auto refund', () => {
  it('only for a cheap, untouched, undisputed charge and only when enabled', () => {
    const ok = {
      maxCents: 1_500,
      chargeCents: 1_200,
      alreadyRefundedCents: 0,
      disputed: false,
    };
    expect(efwAutoRefund(ok)).toBe(true);
    expect(efwAutoRefund({ ...ok, maxCents: 0 })).toBe(false);
    expect(efwAutoRefund({ ...ok, chargeCents: 5_000 })).toBe(false);
    expect(efwAutoRefund({ ...ok, alreadyRefundedCents: 100 })).toBe(false);
    expect(efwAutoRefund({ ...ok, disputed: true })).toBe(false);
  });
});

describe('disputeOpen', () => {
  it.each([
    ['needs_response', true],
    ['under_review', true],
    ['warning_needs_response', true],
    ['won', false],
    ['lost', false],
    ['warning_closed', false],
  ])('%s -> %s', (status, open) => {
    expect(disputeOpen(status)).toBe(open);
  });
});

describe('evidence packet', () => {
  const facts: EvidenceFacts = {
    paymentId: 'cp_1',
    caseTitle: 'Lease dispute',
    caseId: 'case_1',
    amountCents: 50_000,
    clientTotalCents: 51_500,
    currency: 'usd',
    paidAt: at('2026-10-20T10:00:00Z'),
    clientName: 'Jane Client',
    clientEmail: 'jane@example.com',
    attorneyName: 'Al Attorney',
    bidAcceptedAt: at('2026-10-18T09:00:00Z'),
    caseCreatedAt: at('2026-10-17T09:00:00Z'),
    receiptUrl: 'https://pay.stripe.com/receipts/x',
    purchaseIp: '203.0.113.7',
    consents: [
      {
        type: 'terms',
        granted: true,
        at: at('2026-10-01T00:00:00Z'),
        ip: '203.0.113.7',
      },
      {
        type: 'marketing_email',
        granted: true,
        at: at('2026-10-01T00:00:00Z'),
        ip: null,
      },
    ],
    chat: {
      messages: 12,
      clientMessages: 5,
      attorneyMessages: 7,
      attachments: 2,
      voiceNotes: 1,
      firstAt: at('2026-10-18T09:05:00Z'),
      lastAt: at('2026-10-20T09:55:00Z'),
    },
    calls: { count: 1, totalSeconds: 900 },
    request: null,
    refundedCents: 0,
  };

  it('fills Stripe evidence fields from our records', () => {
    const f = buildEvidenceFields(facts);
    expect(f.customer_name).toBe('Jane Client');
    expect(f.customer_email_address).toBe('jane@example.com');
    expect(f.customer_purchase_ip).toBe('203.0.113.7');
    expect(f.service_date).toBe('2026-10-18');
    expect(f.product_description).toContain('Lease dispute');
    expect(f.access_activity_log).toContain('Messages in the case chat: 12');
    expect(f.access_activity_log).toContain('Calls with the attorney: 1');
    expect(f.cancellation_policy_disclosure).toContain('terms at 2026-10-01');
    // only terms-type consents, not marketing
    expect(f.cancellation_policy_disclosure).not.toContain('marketing');
  });

  it('never puts chat content in the packet (metadata only)', () => {
    const text = JSON.stringify(buildEvidenceFields(facts));
    expect(text).toContain('privileged');
    expect(evidenceDocumentLines(facts).join('\n')).not.toMatch(
      /body_original/,
    );
  });

  it('says so when no terms acceptance exists, and keeps fields under the limit', () => {
    const f = buildEvidenceFields({
      ...facts,
      consents: [],
      caseTitle: 'x'.repeat(30_000),
    });
    expect(f.cancellation_policy_disclosure).toContain('No explicit terms');
    expect(f.product_description.length).toBeLessThanOrEqual(19_000);
  });
});
