import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminAttorneyAdsController } from './admin-attorney-ads.controller';
import { AdminAttorneyAdsService } from './admin-attorney-ads.service';
import { AttorneyAdsService } from './attorney-ads.service';

/** Owner 2026-10-28: the checker + archive + flags. `@Global()` because
 * posts, profiles, promotions and bid packs all ask it. */
@Global()
@Module({
  providers: [AttorneyAdsService],
  exports: [AttorneyAdsService],
})
export class AttorneyAdsCoreModule {}

/** The admin HTTP side (API process only). */
@Module({
  imports: [AttorneyAdsCoreModule, AdminAccessModule],
  controllers: [AdminAttorneyAdsController],
  providers: [AdminAttorneyAdsService],
})
export class AttorneyAdsModule {}
