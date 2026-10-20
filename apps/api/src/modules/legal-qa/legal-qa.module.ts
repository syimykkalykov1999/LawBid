import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminLegalQaController } from './admin-legal-qa.controller';
import { AdminLegalQaService } from './admin-legal-qa.service';
import { LegalQaController } from './legal-qa.controller';
import { LegalQaService } from './legal-qa.service';

/** Owner 2026-10-20: «Вопрос юристу». */
@Module({
  imports: [
    BlocksModule,
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    UsageLimitsModule,
  ],
  controllers: [LegalQaController, AdminLegalQaController],
  providers: [LegalQaService, AdminLegalQaService],
  exports: [LegalQaService],
})
export class LegalQaModule {}
