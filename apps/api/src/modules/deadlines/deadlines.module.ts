import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import {
  AdminDeadlinesController,
  DeadlinesController,
} from './deadlines.controller';
import { DeadlinesService } from './deadlines.service';

/** Owner 2026-10-20: the deadline calculator and its admin reference. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule],
  controllers: [DeadlinesController, AdminDeadlinesController],
  providers: [DeadlinesService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
