import { Module } from '@nestjs/common';
import { JournalModule } from '../../journal/journal.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CaseToolsSettings } from './case-tools.settings';
import { CaseToolsSweepService } from './case-tools.sweep';

/** Owner 2026-10-25: the settings and the hourly sweep of the case tools,
 * light enough for the worker (`case-tools.sweep`) and shared with the API. */
@Module({
  imports: [JournalModule, NotificationsModule],
  providers: [CaseToolsSettings, CaseToolsSweepService],
  exports: [CaseToolsSettings, CaseToolsSweepService],
})
export class CaseToolsSweepModule {}
