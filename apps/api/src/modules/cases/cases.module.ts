import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BidsModule } from '../bids/bids.module';
import { FilesModule } from '../files/files.module';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { CaseBidsController } from './case-bids/case-bids.controller';
import { CaseBidsService } from './case-bids/case-bids.service';
import { CasesController } from './cases.controller';
import { CasesFeedController } from './cases-feed.controller';
import { CasesService } from './cases.service';
import { CaseContactsController } from './contacts/case-contacts.controller';
import { CaseContactsService } from './contacts/case-contacts.service';
import { ContactIssuesAdminController } from './contacts/contact-issues-admin.controller';
import { CaseStateMachine } from './domain/case-state-machine';
import { CaseDisputesAdminController } from './lifecycle/case-disputes-admin.controller';
import { CaseLifecycleController } from './lifecycle/case-lifecycle.controller';
import { CaseLifecycleModule } from './lifecycle/case-lifecycle.module';
import { CaseAccessPolicy } from './policies/case-access.policy';
import { CaseViewTrackingService } from './services/case-view-tracking.service';
import { CasesFeedService } from './services/cases-feed.service';

/** docs/04_CASES_BIDS.md §3 (stage 4.2): case creation and management
 * (CasesService, CasesController) on top of the stage 4.1 case lifecycle
 * machine and access policy, plus the stage 4.3 attorney
 * feed/detail/view-tracking/save controller. Stage 4.5 adds the client's
 * bid list (`case-bids/`, §5.2) and client contacts + "Не могу связаться"
 * (`contacts/`, §8), incl. the support decision endpoint. Stage 4.6: the
 * lifecycle (`lifecycle/`, §10) — completion, dispute, admin decision. */
@Module({
  imports: [
    UsersModule,
    BidsModule,
    JournalModule,
    NotificationsModule,
    // Stage 4.5: avatar links for the bid list (FilesService), the
    // subscription gate on contacts, admin RBAC + audit_log for §8.4.
    FilesModule,
    SubscriptionsModule,
    AdminAccessModule,
    // Stage 4.6: the lifecycle service (shared with the §10.2 jobs).
    CaseLifecycleModule,
  ],
  controllers: [
    CasesController,
    CasesFeedController,
    CaseBidsController,
    CaseContactsController,
    ContactIssuesAdminController,
    CaseLifecycleController,
    CaseDisputesAdminController,
  ],
  providers: [
    CasesService,
    CaseStateMachine,
    CaseAccessPolicy,
    CasesFeedService,
    CaseViewTrackingService,
    CaseBidsService,
    CaseContactsService,
  ],
  exports: [CasesService, CaseStateMachine, CaseAccessPolicy],
})
export class CasesModule {}
