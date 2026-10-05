import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { ContentTranslationService } from './content-translation.service';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

/** Owner 2026-10-05: the paid translator, per zone. */
@Module({
  imports: [FeatureFlagsModule],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationCoreModule {}

@Module({
  imports: [TranslationCoreModule, CasesModule],
  controllers: [TranslationController],
  providers: [ContentTranslationService],
})
export class TranslationModule {}
