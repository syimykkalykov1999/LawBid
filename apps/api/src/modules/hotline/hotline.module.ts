import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminHotlineController } from './admin-hotline.controller';
import { CallsHotlineBridge, HOTLINE_CALL_BRIDGE } from './hotline-call-bridge';
import { HotlineConflictService } from './hotline-conflict.service';
import { HotlineController } from './hotline.controller';
import { HotlineGateway } from './hotline.gateway';
import { HotlineService } from './hotline.service';
import { HotlineSweeper } from './hotline-sweeper.service';

/** Owner row 87 (16.11): the call hotline — server part (plan PR 3). Valkey
 * holds everything live. The voice is the existing 1:1 call (plan PR 4),
 * reached ONLY through `hotline-call-bridge.ts` and the public CallsService /
 * ChatService; the calls code is not changed (pinned by
 * hotline-calls-untouched.spec.ts). Off by default (flag `hotline`). The
 * gateway adds its events to the existing `/realtime` socket server. */
@Module({
  imports: [FeatureFlagsModule],
  controllers: [HotlineController, AdminHotlineController],
  providers: [
    HotlineService,
    HotlineConflictService,
    HotlineGateway,
    HotlineSweeper,
    CallsHotlineBridge,
    { provide: HOTLINE_CALL_BRIDGE, useExisting: CallsHotlineBridge },
  ],
  exports: [HotlineService],
})
export class HotlineModule {}
