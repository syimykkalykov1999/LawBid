import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { BunnyStreamClient } from './bunny-stream.client';
import { VideosService } from './videos.service';

/** Owner 2026-10-01 — Bunny Stream video assets (no posts dependency;
 * PostsModule wires videos into posts, the webhook and the sweep). */
@Module({
  imports: [FeatureFlagsModule, UsageLimitsModule],
  providers: [BunnyStreamClient, VideosService],
  exports: [BunnyStreamClient, VideosService],
})
export class VideosModule {}
