import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { SearchModule } from '../search/search.module';
import { AdminLegalQaController } from './admin-legal-qa.controller';
import { AdminLegalQaService } from './admin-legal-qa.service';
import { LegalQaController } from './legal-qa.controller';
import { LegalQaService } from './legal-qa.service';
import { QaSafetyService } from './qa-safety.service';

/** Owner 2026-10-20: «Вопрос юристу». */
@Module({
  imports: [
    BlocksModule,
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    // R-401: recommended questions from the nightly snapshot.
    RecommendationsModule,
    SearchModule,
    UsageLimitsModule,
  ],
  controllers: [LegalQaController, AdminLegalQaController],
  providers: [LegalQaService, AdminLegalQaService, QaSafetyService],
  exports: [LegalQaService],
})
export class LegalQaModule {}
