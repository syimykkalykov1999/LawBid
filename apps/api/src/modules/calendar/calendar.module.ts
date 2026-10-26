import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { CalendarCoreModule } from './calendar-core.module';
import { CalendarController } from './calendar.controller';
import { IcsFeedService } from './ics-feed.service';
import { AdminNoShowController, NoShowController } from './no-show.controller';

/** Owner 2026-10-28: calendar feed, Google / Outlook links, no-shows (API). */
@Module({
  imports: [CalendarCoreModule, DeadlinesModule, AdminAccessModule],
  controllers: [CalendarController, NoShowController, AdminNoShowController],
  providers: [IcsFeedService],
})
export class CalendarModule {}
