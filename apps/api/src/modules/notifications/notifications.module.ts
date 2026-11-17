import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { BadgesService } from './badges.service';
import { NotificationsService } from './notifications.service';
import { PushQueueService } from './push/push-queue.service';
import { CaseAudienceService } from './case-fanout/case-audience.service';
import { CaseFanoutService } from './case-fanout/case-fanout.service';
import { PostFanoutService } from './post-fanout.service';
import { SubscriptionAlertsService } from './subscription-alerts.service';

/** docs/05 §9.3 NotificationsService.emit, the `push` queue producer and
 * the §10 badge counters. REST lives in NotificationsApiModule; delivery
 * in PushModule. */
@Module({
  // Owner 2026-11-16 (row 183): BadgesService reads the switch «Группы».
  imports: [FeatureFlagsModule],
  providers: [
    NotificationsService,
    PushQueueService,
    BadgesService,
    SubscriptionAlertsService,
    CaseAudienceService,
    CaseFanoutService,
    PostFanoutService,
  ],
  exports: [
    NotificationsService,
    PushQueueService,
    BadgesService,
    SubscriptionAlertsService,
    CaseFanoutService,
    PostFanoutService,
  ],
})
export class NotificationsModule {}
