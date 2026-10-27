import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { S3StorageService } from '../../modules/files/storage/s3-storage.service';
import { EconomyService } from './economy.service';

/** Owner 2026-10-16: the economy guard (`economy.guard` cron, admin card
 * «Экономика»). Global like CostGuardModule / OpsModule it builds on. */
@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [EconomyService, S3StorageService],
  exports: [EconomyService],
})
export class EconomyModule {}
