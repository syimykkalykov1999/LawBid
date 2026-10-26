import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { CaseStateMachine } from '../cases/domain/case-state-machine';
import { ChatSystemModule } from '../chat/chat-system.module';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCaseManagementController } from './admin-case-management.controller';
import { AdminCaseManagementService } from './admin-case-management.service';
import { AdminCasesController } from './admin-cases.controller';
import { AdminCasesService } from './admin-cases.service';

/** docs/06 §2.3 item 5 (stage 6.5): read side of the case queues.
 * Audit 2026-10-02: the case list / card and the support actions (the
 * machines are stateless providers, as in CaseLifecycleModule). */
@Module({
  imports: [
    AdminAccessModule,
    JournalModule,
    NotificationsModule,
    ChatSystemModule,
  ],
  controllers: [AdminCasesController, AdminCaseManagementController],
  providers: [
    AdminCasesService,
    AdminCaseManagementService,
    CaseStateMachine,
    BidStateMachine,
  ],
})
export class AdminCasesModule {}
