import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminHotlineController } from './admin-hotline.controller';
import { HotlineConflictService } from './hotline-conflict.service';
import { HOTLINE_NOTIFIER } from './hotline-notifier';
import { PushHotlineNotifier } from './hotline-push-notifier';
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
    // plan PR 5: «Адвокат на линии» as a push to a closed app too
    PushHotlineNotifier,
    { provide: HOTLINE_NOTIFIER, useExisting: PushHotlineNotifier },
  ],
  exports: [HotlineService],
})
export class HotlineModule {}
