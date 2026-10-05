import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { SupportModule } from '../support/support.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

/** Owner 2026-10-05: «Рабочее место» for every admin role. */
@Module({
  imports: [SupportModule, RewardsModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
