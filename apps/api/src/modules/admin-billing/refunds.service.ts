import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Payment, Prisma, Refund } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  PAYMENT_PROVIDER,
  SUBSCRIPTION_CURRENCY,
} from '../billing/billing.constants';
import { refreshProvider } from '../billing/dynamic-payment.provider';
import type { PaymentProvider } from '../billing/payment-provider';
import type {
  AdminBillingUserDto,
  AdminPaymentDto,
  AdminPaymentsQueryDto,
  AdminRefundsQueryDto,
  CreateRefundDto,
  RefundDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';

/** Refund statuses that hold money (a failed one frees it again). */
export const LIVE_REFUND_STATUSES = ['pending', 'succeeded'];

export function refundableCents(paidCents: number, refundedCents: number) {
  return Math.max(0, paidCents - refundedCents);
}

/**
 * The refund rule: only a succeeded payment, and at most what is left of
 * it. Throws the API error, or returns the amount left after the refund.
 */
export function assertRefundAllowed(
  payment: Pick<Payment, 'status' | 'amount_cents'>,
  refundedCents: number,
  amountCents: number,
): number {
  if (payment.status !== 'succeeded') {
    throw new ConflictException({
      code: ErrorCode.REFUND_NOT_ALLOWED,
      message: 'Only a succeeded payment can be refunded.',
      details: { status: payment.status },
    });
  }
  const left = refundableCents(payment.amount_cents, refundedCents);
  if (amountCents < 1 || amountCents > left) {
    throw new ConflictException({
      code: ErrorCode.REFUND_AMOUNT_EXCEEDED,
      message: 'The refund is more than what is left of the payment.',
      details: { refundableCents: left },
    });
  }
  return left - amountCents;
}

/**
 * Owner 2026-10-02: the admin Payments screen and refunds (super_admin,
 * finance). The Refund row is reserved inside a serializable transaction
 * (two admins can't over-refund), then the provider is called with the
 * row id as its idempotency key; a full refund marks the payment refunded.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditLogService,
  ) {}

  async payments(q: AdminPaymentsQueryDto): Promise<Page<AdminPaymentDto>> {
    const rows = await this.prisma.payment.findMany({
      where: {
        AND: [
          q.status ? { status: q.status } : {},
          q.userId ? { user_id: q.userId } : {},
          q.from ? { created_at: { gte: new Date(q.from) } } : {},
          q.to ? { created_at: { lt: new Date(q.to) } } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const page = rows.slice(0, ADMIN_BILLING_PAGE);
    const [users, refunded] = await Promise.all([
      usersById(
        this.prisma,
        page.map((r) => r.user_id),
      ),
      this.refundedByPayment(page.map((r) => r.id)),
    ]);
    return toPage(rows, ADMIN_BILLING_PAGE, (p) =>
      presentPayment(p, users, refunded.get(p.id) ?? 0),
    );
  }

  async refunds(q: AdminRefundsQueryDto): Promise<Page<RefundDto>> {
    const rows = await this.prisma.refund.findMany({
      where: {
        AND: [
          q.paymentId ? { payment_id: q.paymentId } : {},
          q.userId ? { user_id: q.userId } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => presentRefund(r, users));
  }

  async refund(admin: AdminActor, dto: CreateRefundDto): Promise<RefundDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Payment not found.',
      });
    }
    await refreshProvider(this.provider);
    const intentId =
      payment.stripe_payment_intent_id ??
      (this.provider.name === 'fake' ? `pi_fake_${payment.id}` : null);
    if (!intentId || typeof this.provider.refund !== 'function') {
      throw new ConflictException({
        code: ErrorCode.REFUND_NOT_ALLOWED,
        message: 'This payment has no provider charge to refund.',
      });
    }
    // Reserve: re-sum and insert in one serializable transaction.
    const { row, left } = await withTxRetry(this.prisma, async (tx) => {
      const sum = await tx.refund.aggregate({
        where: {
          payment_id: payment.id,
          status: { in: LIVE_REFUND_STATUSES },
        },
        _sum: { amount_cents: true },
      });
      const remaining = assertRefundAllowed(
        payment,
        sum._sum.amount_cents ?? 0,
        dto.amountCents,
      );
      const created = await tx.refund.create({
        data: {
          payment_id: payment.id,
          user_id: payment.user_id,
          amount_cents: dto.amountCents,
          reason: dto.reason,
          status: 'pending',
          admin_id: admin.id,
        },
      });
      return { row: created, left: remaining };
    });

    let result: Refund;
    try {
      const r = await this.provider.refund({
        paymentIntentId: intentId,
        amountCents: dto.amountCents,
        idempotencyKey: `refund:${row.id}`,
        metadata: { refundId: row.id, paymentId: payment.id },
      });
      result = await withTxRetry(this.prisma, async (tx) => {
        const updated = await tx.refund.update({
          where: { id: row.id },
          data: {
            status: r.status,
            stripe_refund_id: r.id,
            failure_reason: r.failureReason,
          },
        });
        if (r.status === 'succeeded' && left === 0) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'refunded' },
          });
        }
        return updated;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.refund.update({
        where: { id: row.id },
        data: { status: 'failed', failure_reason: message.slice(0, 500) },
      });
      await this.record(admin, row, payment, 'failed', message);
      this.logger.error(`refund ${row.id} failed: ${message}`);
      throw new BadGatewayException({
        code: ErrorCode.REFUND_PROVIDER_FAILED,
        message: 'The payment provider refused the refund.',
      });
    }
    await this.record(admin, result, payment, result.status, null);
    return presentRefund(
      result,
      await usersById(this.prisma, [result.user_id]),
    );
  }

  // ------------------------------------------------------------------

  private async refundedByPayment(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.refund.groupBy({
      by: ['payment_id'],
      where: { payment_id: { in: ids }, status: { in: LIVE_REFUND_STATUSES } },
      _sum: { amount_cents: true },
    });
    return new Map(groups.map((g) => [g.payment_id, g._sum.amount_cents ?? 0]));
  }

  private record(
    admin: AdminActor,
    refund: Refund,
    payment: Payment,
    status: string,
    error: string | null,
  ): Promise<void> {
    const after: Prisma.InputJsonObject = {
      paymentId: payment.id,
      userId: payment.user_id,
      amountCents: refund.amount_cents,
      paidCents: payment.amount_cents,
      reason: refund.reason,
      status,
      stripeRefundId: refund.stripe_refund_id,
      error,
    };
    return this.audit.record({
      adminId: admin.id,
      action: 'billing.refund.create',
      targetType: 'payment',
      targetId: payment.id,
      after,
      ip: admin.ip,
    });
  }
}

export function presentPayment(
  p: Payment,
  users: Map<string, AdminBillingUserDto>,
  refundedCents: number,
): AdminPaymentDto {
  return {
    id: p.id,
    userId: p.user_id,
    user: users.get(p.user_id) ?? null,
    amountCents: p.amount_cents,
    currency: p.currency || SUBSCRIPTION_CURRENCY,
    status: p.status,
    paidAt: p.paid_at?.toISOString() ?? null,
    failureCode: p.failure_code,
    stripeInvoiceId: p.stripe_invoice_id,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    refundedCents,
    refundableCents:
      p.status === 'succeeded'
        ? refundableCents(p.amount_cents, refundedCents)
        : 0,
    createdAt: p.created_at.toISOString(),
  };
}

export function presentRefund(
  r: Refund,
  users: Map<string, AdminBillingUserDto>,
): RefundDto {
  return {
    id: r.id,
    paymentId: r.payment_id,
    userId: r.user_id,
    user: users.get(r.user_id) ?? null,
    amountCents: r.amount_cents,
    reason: r.reason,
    status: r.status,
    stripeRefundId: r.stripe_refund_id,
    failureReason: r.failure_reason,
    adminId: r.admin_id,
    createdAt: r.created_at.toISOString(),
  };
}
