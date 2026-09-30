import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { CountersModule } from '../counters/counters.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';
import { CONTENT_MODERATION_HOOK } from './content-moderation.hook';
import { ModerationService } from './moderation.service';
import { RuleBasedModerationHook } from './rule-based-moderation.hook';

/**
 * docs/05 §12 connection points + docs/06 §3 (stage 6.4): the rule-based
 * `ContentModerationHook`, the shared status/auto-hide service (global —
 * ReportsService and ReviewsService call it after storing a report) and
 * the admin queue.
 */
@Global()
@Module({
  imports: [
    CountersModule,
    FilesModule,
    AdminAccessModule,
    NotificationsModule,
    AdminUsersModule,
  ],
  controllers: [AdminModerationController],
  providers: [
    { provide: CONTENT_MODERATION_HOOK, useClass: RuleBasedModerationHook },
    ModerationService,
    AdminModerationService,
  ],
  exports: [CONTENT_MODERATION_HOOK, ModerationService],
})
export class ModerationModule {}
