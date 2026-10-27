import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminConfigModule } from '../admin-config/admin-config.module';
import { AdminLaunchModule } from '../admin-launch/admin-launch.module';
import { AdminPromotionController } from './admin-promotion.controller';
import { PromotionService } from './promotion.service';
import { PublicSeoSettingsController } from './public-seo-settings.controller';
import { SeoManifestService } from './seo-manifest.service';

/** Owner 2026-10-27: admin «Продвижение» (SEO switches, channel checklist). */
@Module({
  imports: [AdminAccessModule, AdminConfigModule, AdminLaunchModule],
  controllers: [AdminPromotionController, PublicSeoSettingsController],
  providers: [PromotionService, SeoManifestService],
})
export class AdminPromotionModule {}
