import { ConflictException } from '@nestjs/common';
import { DisputeService } from './dispute.service';

/**
 * Stripe robustness 2026-10-27: evidence draft / submit through Stripe's
 * dispute evidence API, payout hold and release, deadline reminders and the
 * dispute-rate alarm. Stripe is a recording fake.
 */
type Row = Record<string, unknown>;

function make(opts: { settings?: Record<string, unknown> } = {}) {
  const payment: Row = {
    id: 'cp_1',
    case_id: 'case_1',
    attorney_id: 'att_1',
    client_id: 'cli_1',
    stripe_account_id: 'acct_1',
    dispute_id: 'dp_1',
    dispute_evidence_status: null,
    status: 'disputed',
    dispute_status: 'needs_response',
    amount_cents: 50_000,
    client_total_cents: 51_500,
    currency: 'usd',
    paid_at: new Date('2026-10-20T10:00:00Z'),
    receipt_url: null,
    request_id: null,
  };
  const state = {
    payment,
    payoutAccount: { stripe_account_id: 'acct_1', payouts_held: false } as Row,
  };
  const items: Row[] = [];
  const prisma = {
    casePayment: {
      findUnique: jest.fn(() => Promise.resolve(state.payment)),
      update: jest.fn(({ data }: { data: Row }) => {
        state.payment = { ...state.payment, ...data };
        return Promise.resolve(state.payment);
      }),
      count: jest.fn(() => Promise.resolve(0)),
    },
    case: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'case_1',
          title: 'Lease',
          created_at: new Date('2026-10-17'),
          accepted_bid_id: 'bid_1',
        }),
      ),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          first_name: 'Jane',
          last_name: 'C',
          email: 'j@x.io',
        }),
      ),
    },
    bid: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          created_at: new Date(),
          updated_at: new Date('2026-10-18'),
        }),
      ),
    },
    paymentRequest: { findUnique: jest.fn(() => Promise.resolve(null)) },
    casePaymentRefund: { findMany: jest.fn(() => Promise.resolve([])) },
    conversation: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'conv_1' }])),
    },
    message: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            sender_id: 'cli_1',
            type: 'text',
            created_at: new Date('2026-10-18'),
          },
          {
            sender_id: 'att_1',
            type: 'text',
            created_at: new Date('2026-10-19'),
          },
        ]),
      ),
    },
    call: { findMany: jest.fn(() => Promise.resolve([{ duration_sec: 60 }])) },
    userConsent: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            consent_type: 'terms',
            granted: true,
            created_at: new Date('2026-10-01'),
            ip: '1.2.3.4',
          },
        ]),
      ),
    },
    session: { findFirst: jest.fn(() => Promise.resolve({ ip: '1.2.3.4' })) },
    payoutAccount: {
      findUnique: jest.fn(() => Promise.resolve(state.payoutAccount)),
      updateMany: jest.fn(({ data }: { data: Row }) => {
        state.payoutAccount = { ...state.payoutAccount, ...data };
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn(({ data }: { data: Row }) => {
        state.payoutAccount = { ...state.payoutAccount, ...data };
        return Promise.resolve(state.payoutAccount);
      }),
    },
    attorneyTrust: { findUnique: jest.fn(() => Promise.resolve(null)) },
    stripeReviewItem: {
      findMany: jest.fn(() => Promise.resolve(items)),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const i = items.find((x) => x.id === where.id)!;
          Object.assign(i, data);
          return Promise.resolve(i);
        },
      ),
      count: jest.fn(() => Promise.resolve(0)),
    },
    payment: {
      count: jest.fn(() => Promise.resolve(0)),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
  };
  const settingsMap: Record<string, unknown> = {
    'stripe_ops.hold_payouts_on_dispute': true,
    'stripe_ops.dispute_auto_draft': true,
    'stripe_ops.dispute_reminder_days': [5, 2, 1],
    'stripe_ops.dispute_rate_warn_percent': 0.5,
    'stripe_ops.dispute_rate_alarm_percent': 1,
    'stripe_ops.dispute_rate_min_count': 3,
    ...opts.settings,
  };
  const settings = {
    boolean: jest.fn((k: string) => Promise.resolve(settingsMap[k] as boolean)),
    number: jest.fn((k: string) => Promise.resolve(settingsMap[k] as number)),
    numberList: jest.fn((k: string) =>
      Promise.resolve(settingsMap[k] as number[]),
    ),
  };
  const review = {
    open: jest.fn(() => Promise.resolve({})),
    closeByRef: jest.fn(() => Promise.resolve()),
    notifyStaff: jest.fn(() => Promise.resolve()),
  };
  const provider = {
    retrieveDispute: jest.fn(() =>
      Promise.resolve({
        id: 'dp_1',
        status: 'needs_response',
        pastDue: false,
        submissionCount: 0,
      }),
    ),
    updateDisputeEvidence: jest.fn(() =>
      Promise.resolve({
        id: 'dp_1',
        status: 'under_review',
        submissionCount: 1,
      }),
    ),
    uploadEvidenceFile: jest.fn(() => Promise.resolve('file_1')),
    setConnectPayoutsHeld: jest.fn(() => Promise.resolve()),
  };
  const notifications = { emit: jest.fn(() => Promise.resolve()) };
  const pino = { warn: jest.fn() };
  const svc = new DisputeService(
    prisma as never,
    settings as never,
    review as never,
    provider as never,
    notifications as never,
    pino as never,
  );
  return { svc, state, items, prisma, review, provider, notifications, pino };
}

describe('DisputeService evidence', () => {
  it('buildDraft saves the packet in Stripe WITHOUT submitting it', async () => {
    const h = make();
    expect(await h.svc.buildDraft('cp_1')).toEqual({ saved: true });
    expect(h.provider.uploadEvidenceFile).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct_1', mime: 'application/pdf' }),
    );
    const call = (
      h.provider.updateDisputeEvidence.mock.calls[0] as unknown[]
    )[0] as {
      submit: boolean;
      evidence: Record<string, string>;
      accountId: string;
    };
    expect(call.submit).toBe(false);
    expect(call.accountId).toBe('acct_1');
    expect(call.evidence.service_documentation).toBe('file_1');
    expect(call.evidence.customer_purchase_ip).toBe('1.2.3.4');
    expect(h.state.payment.dispute_evidence_status).toBe('draft');
  });

  it('submit sends it, marks submitted and closes the queue item', async () => {
    const h = make();
    h.state.payment.dispute_evidence_status = 'draft';
    const sent = await h.svc.submit('cp_1');
    expect(sent.submissionCount).toBe(1);
    const call = (
      h.provider.updateDisputeEvidence.mock.calls[0] as unknown[]
    )[0] as {
      submit: boolean;
    };
    expect(call.submit).toBe(true);
    expect(h.state.payment.dispute_evidence_status).toBe('submitted');
    expect(h.review.closeByRef).toHaveBeenCalledWith(
      'dispute',
      'dp_1',
      expect.any(String),
    );
  });

  it('submit refuses a dispute that is closed or past due', async () => {
    const closed = make();
    closed.provider.retrieveDispute.mockResolvedValue({
      id: 'dp_1',
      status: 'lost',
      pastDue: false,
      submissionCount: 1,
    });
    await expect(closed.svc.submit('cp_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const late = make();
    late.provider.retrieveDispute.mockResolvedValue({
      id: 'dp_1',
      status: 'needs_response',
      pastDue: true,
      submissionCount: 0,
    });
    await expect(late.svc.submit('cp_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(late.provider.updateDisputeEvidence).not.toHaveBeenCalled();
  });
});

describe('DisputeService webhook side', () => {
  const dispute = {
    id: 'dp_1',
    status: 'needs_response',
    reason: 'fraudulent',
    amount: 51_500,
    dueBy: 1_900_000_000,
  };

  it('a new dispute opens a queue item with Stripe deadline, holds payouts and drafts evidence', async () => {
    const h = make();
    await h.svc.onCaseDispute(h.state.payment as never, dispute, true);
    expect(h.review.open).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'dispute',
        stripeRef: 'dp_1',
        dueAt: new Date(1_900_000_000_000),
      }),
    );
    expect(h.provider.setConnectPayoutsHeld).toHaveBeenCalledWith(
      'acct_1',
      true,
      null,
    );
    expect(h.state.payoutAccount.payouts_held).toBe(true);
    expect(h.state.payment.dispute_evidence_status).toBe('draft');
  });

  it('the payout hold and the auto draft obey their settings', async () => {
    const h = make({
      settings: {
        'stripe_ops.hold_payouts_on_dispute': false,
        'stripe_ops.dispute_auto_draft': false,
      },
    });
    await h.svc.onCaseDispute(h.state.payment as never, dispute, true);
    expect(h.provider.setConnectPayoutsHeld).not.toHaveBeenCalled();
    expect(h.provider.updateDisputeEvidence).not.toHaveBeenCalled();
  });

  it('a closed dispute closes the item and releases the payouts', async () => {
    const h = make();
    h.state.payoutAccount.payouts_held = true;
    await h.svc.onCaseDispute(
      h.state.payment as never,
      { ...dispute, status: 'won' },
      false,
    );
    expect(h.review.closeByRef).toHaveBeenCalledWith(
      'dispute',
      'dp_1',
      expect.stringContaining('won'),
    );
    expect(h.provider.setConnectPayoutsHeld).toHaveBeenCalledWith(
      'acct_1',
      false,
      null,
    );
    expect(h.state.payoutAccount.payouts_held).toBe(false);
  });

  it('payouts stay held while another dispute against the attorney is open', async () => {
    const h = make();
    h.state.payoutAccount.payouts_held = true;
    h.prisma.casePayment.count.mockResolvedValue(1);
    await h.svc.releasePayouts('att_1');
    expect(h.provider.setConnectPayoutsHeld).not.toHaveBeenCalled();
  });
});

describe('DisputeService reminders and rate', () => {
  it('reminds staff and the attorney once per bucket', async () => {
    const h = make();
    const due = new Date('2026-11-10T00:00:00Z');
    h.items.push({
      id: 'it_1',
      kind: 'dispute',
      status: 'open',
      due_at: due,
      reminded_at: null,
      user_id: 'att_1',
      case_payment_id: 'cp_1',
      summary: 'Dispute',
      details: { scope: 'connect' },
    });
    const now = new Date('2026-11-08T12:00:00Z');
    expect(await h.svc.remindDeadlines(now)).toEqual({ reminded: 1 });
    expect(h.review.notifyStaff).toHaveBeenCalled();
    expect(h.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'case_payment_disputed',
        recipientId: 'att_1',
      }),
    );
    // same bucket again: nothing
    expect(
      await h.svc.remindDeadlines(new Date('2026-11-08T20:00:00Z')),
    ).toEqual({
      reminded: 0,
    });
  });

  it('the rate check pages (alert: dispute_rate) near the thresholds, and stays quiet below', async () => {
    const hot = make();
    hot.prisma.casePayment.count
      .mockResolvedValueOnce(12) // disputes
      .mockResolvedValueOnce(1000); // paid
    const r = await hot.svc.checkRate();
    expect(r).toMatchObject({ level: 'alarm', ratePercent: 1.2 });
    expect(hot.pino.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'dispute_rate', level: 'alarm' }),
      expect.any(String),
    );
    expect(hot.review.notifyStaff).toHaveBeenCalled();

    const calm = make();
    calm.prisma.casePayment.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1000);
    expect((await calm.svc.checkRate()).level).toBe('ok');
    expect(calm.pino.warn).not.toHaveBeenCalled();
  });
});
