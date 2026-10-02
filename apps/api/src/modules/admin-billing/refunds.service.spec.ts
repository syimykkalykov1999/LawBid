import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { PaymentProvider } from '../billing/payment-provider';
import {
  assertRefundAllowed,
  refundableCents,
  RefundsService,
} from './refunds.service';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return ((e as HttpException).getResponse() as { code: string }).code;
  }
  return undefined;
}

describe('refund amount rule (owner 2026-10-02)', () => {
  const paid = { status: 'succeeded' as const, amount_cents: 39_900 };

  it('refundable = paid − already refunded, never below 0', () => {
    expect(refundableCents(39_900, 10_000)).toBe(29_900);
    expect(refundableCents(39_900, 50_000)).toBe(0);
  });

  it('up to the rest is allowed; returns what is left', () => {
    expect(assertRefundAllowed(paid, 0, 39_900)).toBe(0);
    expect(assertRefundAllowed(paid, 9_900, 10_000)).toBe(20_000);
  });

  it('more than the rest → REFUND_AMOUNT_EXCEEDED', () => {
    expect(codeOf(() => assertRefundAllowed(paid, 0, 39_901))).toBe(
      'REFUND_AMOUNT_EXCEEDED',
    );
    expect(codeOf(() => assertRefundAllowed(paid, 30_000, 10_000))).toBe(
      'REFUND_AMOUNT_EXCEEDED',
    );
  });

  it('only a succeeded payment → REFUND_NOT_ALLOWED', () => {
    for (const status of ['pending', 'failed', 'refunded'] as const) {
      expect(
        codeOf(() =>
          assertRefundAllowed({ status, amount_cents: 39_900 }, 0, 100),
        ),
      ).toBe('REFUND_NOT_ALLOWED');
    }
  });
});

describe('RefundsService.refund', () => {
  const admin = { id: 'adm1', ip: '1.2.3.4' } as AdminActor;
  const payment = {
    id: 'pay1',
    user_id: 'u1',
    status: 'succeeded',
    amount_cents: 39_900,
    stripe_payment_intent_id: 'pi_1',
    created_at: new Date(),
  };

  function setup(opts: {
    refundedCents?: number;
    providerFails?: boolean;
    status?: 'succeeded' | 'pending';
  }) {
    const refundRow = {
      id: 'ref1',
      payment_id: 'pay1',
      user_id: 'u1',
      amount_cents: 0,
      reason: 'customer asked politely',
      status: 'pending',
      stripe_refund_id: null as string | null,
      failure_reason: null,
      admin_id: 'adm1',
      created_at: new Date(),
    };
    const tx = {
      refund: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount_cents: opts.refundedCents ?? null },
        }),
        create: jest.fn((a: { data: { amount_cents: number } }) =>
          Promise.resolve({ ...refundRow, amount_cents: a.data.amount_cents }),
        ),
        update: jest.fn((a: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...refundRow, ...a.data }),
        ),
      },
      payment: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      refund: { update: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const refund = opts.providerFails
      ? jest.fn().mockRejectedValue(new Error('card_declined'))
      : jest.fn().mockResolvedValue({
          id: 're_1',
          status: opts.status ?? 'succeeded',
          failureReason: null,
        });
    const provider = { name: 'stripe', refund } as unknown as PaymentProvider;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new RefundsService(
      prisma as unknown as PrismaService,
      provider,
      audit as unknown as AuditLogService,
    );
    return { service, tx, prisma, refund, audit };
  }

  const dto = (amountCents: number) => ({
    paymentId: 'pay1',
    amountCents,
    reason: 'customer asked politely',
  });

  it('a full refund marks the payment refunded', async () => {
    const { service, tx, refund, audit } = setup({});
    const r = await service.refund(admin, dto(39_900));
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: 'pi_1',
        amountCents: 39_900,
        idempotencyKey: 'refund:ref1',
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay1' },
      data: { status: 'refunded' },
    });
    expect(r.status).toBe('succeeded');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.refund.create' }),
    );
  });

  it('a partial refund leaves the payment succeeded', async () => {
    const { service, tx } = setup({ refundedCents: 10_000 });
    await service.refund(admin, dto(5_000));
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('above what is left → 409, nothing reserved, provider not called', async () => {
    const { service, tx, refund } = setup({ refundedCents: 30_000 });
    await expect(service.refund(admin, dto(10_000))).rejects.toMatchObject({
      response: { code: 'REFUND_AMOUNT_EXCEEDED' },
    });
    expect(tx.refund.create).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('provider failure → the row is failed and 502', async () => {
    const { service, prisma } = setup({ providerFails: true });
    await expect(service.refund(admin, dto(1_000))).rejects.toMatchObject({
      response: { code: 'REFUND_PROVIDER_FAILED' },
    });
    expect(prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }) as unknown,
      }),
    );
  });
});
