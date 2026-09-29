import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../../../common/app-settings/app-settings.module';
import { AuditLogService } from '../../admin-access/audit-log.service';
import { BidStateMachine } from '../../bids/domain/bid-state-machine';
import { JournalModule } from '../../journal/journal.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ReviewsService } from '../../reviews/reviews.service';
import { CaseStateMachine } from '../domain/case-state-machine';
import { CaseLifecycleService } from './case-lifecycle.service';

/**
 * docs/04 §10 (stage 4.6): the lifecycle service with only its domain
 * dependencies, no controllers — imported by CasesModule (HTTP) and by
 * JobsModule, so the worker process (src/worker.ts) runs the §10.2 jobs
 * without pulling the HTTP-side modules (files, auth guards, cost guard).
 */
@Module({
  imports: [JournalModule, NotificationsModule, AppSettingsModule],
  providers: [
    CaseLifecycleService,
    CaseStateMachine,
    BidStateMachine,
    AuditLogService,
    ReviewsService,
  ],
  exports: [CaseLifecycleService],
})
export class CaseLifecycleModule {}
