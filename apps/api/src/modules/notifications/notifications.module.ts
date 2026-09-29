import { Module } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { NotificationsService } from './notifications.service';
import { PushQueueService } from './push/push-queue.service';

/** docs/05 §9.3 NotificationsService.emit, the `push` queue producer and
 * the §10 badge counters. REST lives in NotificationsApiModule; delivery
 * in PushModule. */
@Module({
  providers: [NotificationsService, PushQueueService, BadgesService],
  exports: [NotificationsService, PushQueueService, BadgesService],
})
export class NotificationsModule {}
