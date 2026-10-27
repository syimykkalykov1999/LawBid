import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { StaffReviewController } from './staff-review.controller';
import { StaffReviewAccessService } from './staff-review-access.service';
import { StaffReviewReadService } from './staff-review-read.service';
import { StaffReviewService } from './staff-review.service';

/**
 * Staff package (T9): the re-check loop — reviewer queue (leased samples,
 * verdicts), golden tasks, reviewer calibration and the owner/head numbers.
 * API only (no jobs: the samples are made by T5's nightly, the calibration
 * is read on demand). Everything answers «not found» while
 * `staff.sampling_enabled` / `staff.rating_enabled` is off. The lease engine
 * (LeaseService), T5's sampling (StaffSamplingService) and STAFF_SIGNALS come
 * from their global modules.
 */
@Module({
  imports: [AdminAccessModule],
  controllers: [StaffReviewController],
  providers: [
    StaffReviewAccessService,
    StaffReviewService,
    StaffReviewReadService,
  ],
})
export class StaffReviewModule {}
