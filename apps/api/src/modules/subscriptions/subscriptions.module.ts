import { Module } from '@nestjs/common';
import { SubscriptionAccessService } from './subscription-access.service';

/** Subscription gate (stub until docs/06 stage 6.7). */
@Module({
  providers: [SubscriptionAccessService],
  exports: [SubscriptionAccessService],
})
export class SubscriptionsModule {}
