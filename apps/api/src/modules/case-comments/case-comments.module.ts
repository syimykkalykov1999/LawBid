import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { CasesModule } from '../cases/cases.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CaseCommentsController } from './case-comments.controller';
import { CaseCommentsService } from './case-comments.service';

/** Owner 2026-09-30 (OQ-034): comments under cases. */
@Module({
  imports: [UsageLimitsModule, NotificationsModule, FilesModule, CasesModule],
  controllers: [CaseCommentsController],
  providers: [CaseCommentsService],
  exports: [CaseCommentsService],
})
export class CaseCommentsModule {}
