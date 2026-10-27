import { Module } from '@nestjs/common';
import { StaffTodayJob } from '../../jobs/handlers/staff-today.job';
import { StaffWeeklyDigestJob } from '../../jobs/handlers/staff-weekly-digest.job';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffAdminActionsAdapter } from '../staff-appeals/staff-admin-actions.adapter';
import { StaffDecisionService } from './staff-decision.service';
import { StaffDigestService } from './staff-digest.service';
import { StaffHomeController } from './staff-home.controller';
import { StaffPersonCardService } from './staff-person-card.service';
import {
  RuleBasedRecommendationTemplate,
  STAFF_RECOMMENDATION_TEMPLATE,
} from './staff-recommendation.template';
import { StaffTodayService } from './staff-today.service';

/**
 * Staff package (T10): the owner «Сегодня» page, the person card, the weekly
 * digest. Core part (providers, the cron jobs, the recommendation text),
 * imported by StaffModule (API) and JobsModule (API + worker). T1 registered
 * the stubs; everything stays a no-op while its switch is off.
 */
@Module({
  imports: [NotificationsModule],
  providers: [
    StaffTodayJob,
    StaffWeeklyDigestJob,
    StaffTodayService,
    StaffDigestService,
    {
      provide: STAFF_RECOMMENDATION_TEMPLATE,
      useClass: RuleBasedRecommendationTemplate,
    },
  ],
  exports: [
    StaffTodayJob,
    StaffWeeklyDigestJob,
    StaffTodayService,
    StaffDigestService,
    STAFF_RECOMMENDATION_TEMPLATE,
  ],
})
export class StaffHomeCoreModule {}

/** Staff package (T10): the admin routes of staff-home (API only). */
@Module({
  imports: [StaffHomeCoreModule, AdminModule, AdminAccessModule],
  controllers: [StaffHomeController],
  providers: [
    StaffPersonCardService,
    StaffDecisionService,
    StaffAdminActionsAdapter,
  ],
})
export class StaffHomeModule {}
