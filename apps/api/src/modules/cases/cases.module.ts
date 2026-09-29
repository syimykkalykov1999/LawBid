import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CasesController } from './cases.controller';
import { CasesFeedController } from './cases-feed.controller';
import { CaseStateMachine } from './domain/case-state-machine';
import { CaseAccessPolicy } from './policies/case-access.policy';
import { CaseViewTrackingService } from './services/case-view-tracking.service';
import { CasesFeedService } from './services/cases-feed.service';

/** Stage 1.7 stub controller (see CasesController, replaced in 4.2) plus
 * the stage 4.1 case lifecycle machine and access policy, and the stage
 * 4.3 attorney feed/detail/view-tracking/save controller. */
@Module({
  imports: [UsersModule],
  controllers: [CasesController, CasesFeedController],
  providers: [
    CaseStateMachine,
    CaseAccessPolicy,
    CasesFeedService,
    CaseViewTrackingService,
  ],
  exports: [CaseStateMachine, CaseAccessPolicy],
})
export class CasesModule {}
