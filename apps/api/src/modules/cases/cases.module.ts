import { Module } from '@nestjs/common';
import { BidsModule } from '../bids/bids.module';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { CaseStateMachine } from './domain/case-state-machine';
import { CaseAccessPolicy } from './policies/case-access.policy';

/** docs/04_CASES_BIDS.md §3 (stage 4.2): case creation and management
 * (CasesService, CasesController) on top of the stage 4.1 case lifecycle
 * machine and access policy. */
@Module({
  imports: [UsersModule, BidsModule, JournalModule, NotificationsModule],
  controllers: [CasesController],
  providers: [CasesService, CaseStateMachine, CaseAccessPolicy],
  exports: [CasesService, CaseStateMachine, CaseAccessPolicy],
})
export class CasesModule {}
