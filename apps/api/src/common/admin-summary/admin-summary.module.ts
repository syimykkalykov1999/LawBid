import { Global, Module } from '@nestjs/common';
import { AdminSummaryService } from './admin-summary.service';

/** Redis-backed precomputed aggregates of the admin panel (global). */
@Global()
@Module({
  providers: [AdminSummaryService],
  exports: [AdminSummaryService],
})
export class AdminSummaryModule {}
