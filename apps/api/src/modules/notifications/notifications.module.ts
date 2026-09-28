import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Global: any module (and the BullMQ worker process) injects the emit()
 * seam without import cycles. Delivery channels arrive with docs/05. */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
