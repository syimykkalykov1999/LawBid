import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LegalQaController } from './legal-qa.controller';
import { LegalQaService } from './legal-qa.service';

/** Owner 2026-10-20: «Вопрос юристу». */
@Module({
  imports: [
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    UsageLimitsModule,
  ],
  controllers: [LegalQaController],
  providers: [LegalQaService],
  exports: [LegalQaService],
})
export class LegalQaModule {}
