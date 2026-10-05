import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Subscription } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import { refreshProvider } from '../billing/dynamic-payment.provider';
import type { PaymentProvider } from '../billing/payment-provider';
import { SubscriptionSyncService } from '../billing/subscription-sync.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import type {
  AdminCancelSubscriptionDto,
  AdminSubscriptionActionResultDto,
  AdminSubscriptionRefundOutcomeDto,
} from './admin-billing.dto';
import { RefundsService } from './refunds.service';

const ENDED = ['canceled', 'expired', 'incomplete'];

/** Cents of [paid] not yet used at [now] in the period [start, end). */
export function proratedCents(
  paid: number,
  start: Date | null,
  end: Date | null,
  now = Date.now(),
): number {
  if (!start || !end) return 0;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  const left = Math.min(Math.max(end.getTime() - now, 0), total);
  return Math.floor((paid * left) / total);
}

/**
 * Owner 2026-10-04 — support cancels an attorney's subscription on request:
 * at the end of the paid period (default) or right away, optionally with a
 * prorated or full refund of the last payment; undo a pending cancel.
 * Reason required, one audit row, the attorney is notified. Stripe that is
 * not configured answers 503 PAYMENTS_NOT_CONFIGURED (DynamicPaymentProvider).
 */
@Injectable()
export class SubscriptionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    private readonly refunds: RefundsService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async cancel(
    admin: AdminActor,
    userId: string,
    dto: AdminCancelSubscriptionDto,
  ): Promise<AdminSubscriptionActionResultDto> {
    const refund = dto.refund ?? 'none';
    if (refund !== 'none' && dto.when !== 'now') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A refund goes only with an immediate cancel.',
        details: { when: dto.when, refund },
      });
    }
    const row = await this.live(userId);
    if (dto.when === 'period_end' && row.cancel_at_period_end) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'The subscription already ends with this period.',
        details: { status: row.status },
      });
    }
    await refreshProvider(this.provider);
    const subId = row.stripe_subscription_id!;
    const remote =
      dto.when === 'now'
        ? await this.provider.cancelNow(subId)
        : await this.provider.setCancelAtPeriodEnd(subId, true);
    const updated =
      (await this.sync.apply(remote, {}, { notify: false })) ?? row;
    await this.access.invalidate(userId);

    let refundOut: AdminSubscriptionRefundOutcomeDto | null = null;
    if (refund !== 'none')
      refundOut = await this.refundLast(admin, row, refund, dto.reason);

    const accessEndsAt =
      dto.when === 'now'
        ? new Date()
        : (row.current_period_end ?? row.trial_ends_at);
    await this.audit.record({
      adminId: admin.id,
      action: 'subscription.cancel',
      targetType: 'subscription',
      targetId: row.id,
      before: {
        status: row.status,
        cancelAtPeriodEnd: row.cancel_at_period_end,
      },
      after: {
        status: updated.status,
        when: dto.when,
        refund,
        refundCents: refundOut?.amountCents ?? 0,
        refundStatus: refundOut?.status ?? null,
        reason: dto.reason,
      },
      ip: admin.ip,
    });
    await this.notifications.emit({
      type: 'subscription_status',
      recipientId: userId,
      payload: {
        status: updated.status,
        canceledBySupport: true,
        when: dto.when,
        accessEndsAt: accessEndsAt?.toISOString() ?? null,
        ...(refundOut && refundOut.amountCents > 0
          ? { refundCents: refundOut.amountCents }
          : {}),
      },
    });
    return {
      status: updated.status,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      accessEndsAt: accessEndsAt?.toISOString() ?? null,
      refund: refundOut,
    };
  }

  /** Undo a pending "cancel at period end". */
  async resume(
    admin: AdminActor,
    userId: string,
    reason: string,
  ): Promise<AdminSubscriptionActionResultDto> {
    const row = await this.live(userId);
    if (!row.cancel_at_period_end) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'The subscription is not set to cancel.',
        details: { status: row.status },
      });
    }
    await refreshProvider(this.provider);
    const remote = await this.provider.setCancelAtPeriodEnd(
      row.stripe_subscription_id!,
      false,
    );
    const updated =
      (await this.sync.apply(remote, {}, { notify: false })) ?? row;
    await this.access.invalidate(userId);
    await this.audit.record({
      adminId: admin.id,
      action: 'subscription.resume',
      targetType: 'subscription',
      targetId: row.id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: updated.cancel_at_period_end, reason },
      ip: admin.ip,
    });
    await this.notifications.emit({
      type: 'subscription_status',
      recipientId: userId,
      payload: { status: updated.status, resumedBySupport: true },
    });
    return {
      status: updated.status,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      accessEndsAt: null,
      refund: null,
    };
  }

  private async live(userId: string): Promise<Subscription> {
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
    });
    if (!row?.stripe_subscription_id || ENDED.includes(row.status)) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'The attorney has no live subscription.',
      });
    }
    return row;
  }

  /** The last paid invoice, refunded in full or for the unused days. A
   * failed refund does not undo the cancel: it is reported back (and the
   * refund row keeps the failure, retry from Деньги → Платежи). */
  private async refundLast(
    admin: AdminActor,
    row: Subscription,
    mode: 'prorated' | 'full',
    reason: string,
  ): Promise<AdminSubscriptionRefundOutcomeDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { user_id: row.user_id, status: 'succeeded' },
      orderBy: [{ paid_at: 'desc' }, { created_at: 'desc' }],
    });
    if (!payment) {
      return { amountCents: 0, status: 'skipped', message: 'No paid invoice.' };
    }
    const already = await this.prisma.refund.aggregate({
      where: {
        payment_id: payment.id,
        status: { in: ['pending', 'succeeded'] },
      },
      _sum: { amount_cents: true },
    });
    const left = payment.amount_cents - (already._sum.amount_cents ?? 0);
    const amount =
      mode === 'full'
        ? left
        : Math.min(
            left,
            proratedCents(
              payment.amount_cents,
              row.current_period_start,
              row.current_period_end,
            ),
          );
    if (amount <= 0) {
      return {
        amountCents: 0,
        status: 'skipped',
        message: 'Nothing left to refund.',
      };
    }
    try {
      const r = await this.refunds.refund(admin, {
        paymentId: payment.id,
        amountCents: amount,
        reason,
      });
      return {
        amountCents: amount,
        status: r.status,
        message: r.failureReason,
      };
    } catch (e) {
      return {
        amountCents: amount,
        status: 'failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
