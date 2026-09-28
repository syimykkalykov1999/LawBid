import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** docs/05 §9.3 seam (see NotificationsService). File 05 adds the
 * controllers (list, read, badges) and delivery queues to this module. */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
