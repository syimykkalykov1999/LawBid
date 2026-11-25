import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { LegalAcceptanceModule } from '../legal-documents/legal-acceptance.module';
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

/** Owner row 87 (16.11): the call hotline — server part (plan PR 3). Valkey
 * holds everything live. The voice is the existing 1:1 call (plan PR 4),
 * reached ONLY through `hotline-call-bridge.ts` and the public CallsService /
 * ChatService; the calls code is not changed (pinned by
 * hotline-calls-untouched.spec.ts). Off by default (flag `hotline`). The
 * gateway adds its events to the existing `/realtime` socket server. */
@Module({
  // LegalAcceptanceModule: «Предложить дело» makes a case, so it asks the
  // same «accept the current documents» as POST /cases.
  imports: [FeatureFlagsModule, LegalAcceptanceModule],
  controllers: [HotlineController, AdminHotlineController],
  providers: [
    HotlineService,
    HotlineConflictService,
    HotlineGateway,
    HotlineSweeper,
    // the admin page's nightly snapshot (owner rule: no live heavy counts)
    HotlineStatsService,
    CallsHotlineBridge,
    { provide: HOTLINE_CALL_BRIDGE, useExisting: CallsHotlineBridge },
    // plan PR 5: «Адвокат на линии» as a push to a closed app too
    PushHotlineNotifier,
    { provide: HOTLINE_NOTIFIER, useExisting: PushHotlineNotifier },
  ],
  exports: [HotlineService],
})
export class HotlineModule {}
