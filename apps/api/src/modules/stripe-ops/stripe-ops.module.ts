import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminStripeOpsController } from './admin-stripe-ops.controller';
import { DisputeService } from './dispute.service';
import { StripeWebhookRequeueService } from './stripe-webhook-requeue.service';
import { StripeReviewService } from './stripe-review.service';

/**
 * Stripe robustness 2026-10-27 (docs/runbooks/STRIPE_ROBUSTNESS.md): the
 * review queue and the dispute helpers. Services only — imported by the
 * case-payments and billing cores and by the jobs module. Uses the global
 * PAYMENT_PROVIDER, prisma, redis and app settings.
 */
@Module({
  imports: [NotificationsModule],
  providers: [StripeReviewService, DisputeService, StripeWebhookRequeueService],
  exports: [StripeReviewService, DisputeService, StripeWebhookRequeueService],
})
export class StripeOpsCoreModule {}

/** The admin endpoints (api process only). */
@Module({
  imports: [StripeOpsCoreModule, AdminAccessModule],
  controllers: [AdminStripeOpsController],
})
export class StripeOpsModule {}
