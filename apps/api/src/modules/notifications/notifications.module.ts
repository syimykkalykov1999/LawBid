import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushQueueService } from './push/push-queue.service';

/** docs/05 §9.3 seam (see NotificationsService) + the `push` queue
 * producer (docs/04 stage 4.8). File 05 adds the controllers (list, read,
 * badges), realtime and FCM delivery. */
@Module({
  providers: [NotificationsService, PushQueueService],
  exports: [NotificationsService, PushQueueService],
})
export class NotificationsModule {}
