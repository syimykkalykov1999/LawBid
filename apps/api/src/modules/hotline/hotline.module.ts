import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminHotlineController } from './admin-hotline.controller';
import { HotlineConflictService } from './hotline-conflict.service';
import { HotlineController } from './hotline.controller';
import { HotlineGateway } from './hotline.gateway';
import { HotlineService } from './hotline.service';
import { HotlineSweeper } from './hotline-sweeper.service';

/** Owner row 87 (16.11): the call hotline — server part (plan PR 3). Valkey
 * holds everything live; the existing 1:1 calls module is not imported and
 * not changed. Off by default (flag `hotline`). The gateway adds its events
 * to the existing `/realtime` socket server. */
@Module({
  imports: [FeatureFlagsModule],
  controllers: [HotlineController, AdminHotlineController],
  providers: [
    HotlineService,
    HotlineConflictService,
    HotlineGateway,
    HotlineSweeper,
  ],
  exports: [HotlineService],
})
export class HotlineModule {}
