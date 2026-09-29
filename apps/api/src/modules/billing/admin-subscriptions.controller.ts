import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import {
  AdminSubscriptionDto,
  AdminSubscriptionUserParamDto,
  ExtendSubscriptionDto,
} from './billing.dto';
import type { PaymentProvider } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';
import { presentPayment, presentSubscription } from './subscriptions.service';

const E = ErrorCode;

/**
 * docs/06 §1.6 / §2.2 "Подписки и платежи": super_admin and finance act,
 * support views. "Продлить подписку на N дней" moves the trial/period end
 * at the provider; the reason is mandatory and audited.
 */
@ApiTags('admin-subscriptions')
@AdminEndpoint('super_admin', 'finance', 'support')
@SkipAutoAudit()
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get(':userId')
  @ApiOperation({
    summary: "An attorney's subscription, payments and the Stripe link",
  })
  @ApiEnvelopeResponse(AdminSubscriptionDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async getAdminSubscription(
    @Param() params: AdminSubscriptionUserParamDto,
  ): Promise<AdminSubscriptionDto> {
    return this.present(params.userId);
  }

  @Post(':userId/extend')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'finance')
  @ApiOperation({ summary: 'Extend by N days (compensation), reason required' })
  @ApiEnvelopeResponse(AdminSubscriptionDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.SUBSCRIPTION_NOT_FOUND] })
  async extendSubscription(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminSubscriptionUserParamDto,
    @Body() dto: ExtendSubscriptionDto,
  ): Promise<AdminSubscriptionDto> {
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: params.userId },
    });
    if (!row?.stripe_subscription_id) {
      throw new NotFoundException({
        code: E.SUBSCRIPTION_NOT_FOUND,
        message: 'The attorney has no subscription.',
      });
    }
    const base = Math.max(
      Date.now(),
      row.trial_ends_at?.getTime() ?? 0,
      row.current_period_end?.getTime() ?? 0,
      row.grace_ends_at?.getTime() ?? 0,
    );
    const until = new Date(base + dto.days * 86_400_000);
    const remote = await this.provider.extendUntil(
      row.stripe_subscription_id,
      Math.floor(until.getTime() / 1000),
    );
    const updated = await this.sync.apply(remote, { grace_ends_at: null });
    await this.access.invalidate(params.userId);
    await this.audit.record({
      adminId: admin.id,
      action: 'subscription.extend',
      targetType: 'subscription',
      targetId: row.id,
      before: {
        status: row.status,
        until:
          (row.trial_ends_at ?? row.current_period_end)?.toISOString() ?? null,
      },
      after: {
        status: updated?.status ?? row.status,
        until: until.toISOString(),
        days: dto.days,
        reason: dto.reason,
      },
      ip: admin.ip,
    });
    await this.notifications.emit({
      type: 'subscription_status',
      recipientId: params.userId,
      payload: {
        status: updated?.status ?? row.status,
        extendedUntil: until.toISOString(),
        days: dto.days,
      },
    });
    return this.present(params.userId);
  }

  private async present(userId: string): Promise<AdminSubscriptionDto> {
    const [user, row, customer, payments] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prisma.subscription.findUnique({ where: { user_id: userId } }),
      this.prisma.stripeCustomer.findUnique({ where: { user_id: userId } }),
      this.prisma.payment.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);
    if (!user) {
      throw new NotFoundException({
        code: E.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const trialsUsedWithCard = row?.card_fingerprint
      ? await this.prisma.subscription.count({
          where: {
            card_fingerprint: row.card_fingerprint,
            trial_started_at: { not: null },
          },
        })
      : 0;
    return {
      userId,
      subscription: row ? presentSubscription(row) : null,
      stripeSubscriptionId: row?.stripe_subscription_id ?? null,
      stripeCustomerId: customer?.stripe_customer_id ?? null,
      dashboardUrl: row?.stripe_subscription_id
        ? this.provider.dashboardUrl(row.stripe_subscription_id)
        : null,
      payments: payments.map(presentPayment),
      trialsUsedWithCard,
    };
  }
}
