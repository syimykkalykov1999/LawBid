import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminHotlineController } from './admin-hotline.controller';
import { CallsHotlineBridge, HOTLINE_CALL_BRIDGE } from './hotline-call-bridge';
import { HotlineConflictService } from './hotline-conflict.service';
import { HOTLINE_NOTIFIER } from './hotline-notifier';
import { PushHotlineNotifier } from './hotline-push-notifier';
import { HotlineController } from './hotline.controller';
import { HotlineGateway } from './hotline.gateway';
import { HotlineService } from './hotline.service';
import { HotlineStatsService } from './hotline-stats.service';
import { HotlineSweeper } from './hotline-sweeper.service';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list HotlineStatsService again (the nightly snapshot), so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  providers: [HotlineStatsService],
  exports: [HotlineStatsService],
})
export class HotlineStatsCoreModule {}

/** Owner row 87 (16.11): the call hotline — server part (plan PR 3). Valkey
 * holds everything live. The voice is the existing 1:1 call (plan PR 4),
 * reached ONLY through `hotline-call-bridge.ts` and the public CallsService /
 * ChatService; the calls code is not changed (pinned by
 * hotline-calls-untouched.spec.ts). Off by default (flag `hotline`). The
 * gateway adds its events to the existing `/realtime` socket server. */
@Module({
  // «Предложить дело» asks the same «accept the current documents» as POST
  // /cases inside the cases port (cases/hotline-cases.adapter.ts).
  imports: [FeatureFlagsModule, HotlineStatsCoreModule],
  controllers: [HotlineController, AdminHotlineController],
  providers: [
    HotlineService,
    HotlineConflictService,
    HotlineGateway,
    HotlineSweeper,
    // the admin page's nightly snapshot (owner rule: no live heavy counts):
    // HotlineStatsService comes from HotlineStatsCoreModule.
    CallsHotlineBridge,
    { provide: HOTLINE_CALL_BRIDGE, useExisting: CallsHotlineBridge },
    // plan PR 5: «Адвокат на линии» as a push to a closed app too
    PushHotlineNotifier,
    { provide: HOTLINE_NOTIFIER, useExisting: PushHotlineNotifier },
  ],
  exports: [HotlineService],
})
export class HotlineModule {}
