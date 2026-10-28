import { Global, Module } from '@nestjs/common';
import { AutoHoldService } from './auto-hold.service';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { CountersModule } from '../counters/counters.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';
import {
  AdminAppealsController,
  ModerationNoticesController,
  MyReportsController,
} from './moderation-appeals.controller';
import { ModerationAppealsService } from './moderation-appeals.service';
import { CONTENT_MODERATION_HOOK } from './content-moderation.hook';
import { AutoAppealsService } from './auto-appeals.service';
import { AutoModerationService } from './auto-moderation.service';
import { ModerationService } from './moderation.service';
import {
  AdminReportAbuseController,
  MyStandingController,
} from './report-abuse.controller';
import { ReporterReputationService } from './reporter-reputation.service';
import { RuleBasedModerationHook } from './rule-based-moderation.hook';
import { StrikesService } from './strikes.service';
import {
  OpenAiTextClassifier,
  TextDetectorService,
} from './text-detector.service';

/**
 * docs/05 §12 connection points + docs/06 §3 (stage 6.4): the rule-based
 * `ContentModerationHook`, the shared status/auto-hide service (global —
 * ReportsService and ReviewsService call it after storing a report) and
 * the admin queue.
 *
 * Owner 2026-10-27: weighted reports, the reporter ladder, strikes,
 * automatic account decisions with appeals, and the text classifier.
 */
@Global()
@Module({
  imports: [
    CountersModule,
    FilesModule,
    AdminAccessModule,
    NotificationsModule,
    AdminUsersModule,
    UsageLimitsModule,
  ],
  controllers: [
    AdminModerationController,
    AdminAppealsController,
    ModerationNoticesController,
    MyReportsController,
    MyStandingController,
    AdminReportAbuseController,
  ],
  providers: [
    { provide: CONTENT_MODERATION_HOOK, useClass: RuleBasedModerationHook },
    ModerationService,
    AdminModerationService,
    ModerationAppealsService,
    ReporterReputationService,
    StrikesService,
    AutoModerationService,
    AutoAppealsService,
    OpenAiTextClassifier,
    TextDetectorService,
    AutoHoldService,
  ],
  // Owner 2026-10-05 (legal): the DMCA decision removes / restores content
  // through the same audited, notified moderation action.
  exports: [
    CONTENT_MODERATION_HOOK,
    ModerationService,
    AdminModerationService,
    ReporterReputationService,
    StrikesService,
    AutoAppealsService,
    AutoHoldService,
  ],
})
export class ModerationModule {}
