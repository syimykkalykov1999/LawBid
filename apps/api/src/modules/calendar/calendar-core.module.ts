import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarBusyService } from './calendar-busy.service';
import { CalendarConfig } from './calendar-config.service';
import { CalendarConnectionsService } from './calendar-connections.service';
import { CalendarHooks } from './calendar-hooks.service';
import { CalendarSyncService } from './calendar-sync.service';
import { NoShowService } from './no-show.service';

/**
 * Owner 2026-10-28: the calendar services without controllers (the booking
 * service and the worker's every-minute sweep use them).
 */
@Module({
  imports: [NotificationsModule],
  providers: [
    CalendarConfig,
    CalendarConnectionsService,
    CalendarBusyService,
    CalendarSyncService,
    NoShowService,
    CalendarHooks,
  ],
  exports: [
    CalendarConfig,
    CalendarConnectionsService,
    CalendarSyncService,
    NoShowService,
    CalendarHooks,
  ],
})
export class CalendarCoreModule {}
