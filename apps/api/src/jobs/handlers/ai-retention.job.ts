import { Injectable } from '@nestjs/common';
import {
  AiRetentionService,
  type AiRetentionResult,
} from '../../modules/ai-attachments/ai-retention.service';

/**
 * Owner 2026-11-12 (row 49): cron job `ai.retention` (nightly). Removes the
 * AI employee's finished records and the images of closed AI tasks / items
 * after the owner's days (ai.retention_records_days / _images_days, 15 by
 * default; 0 = keep forever). Small batches; the learning examples stay.
 */
@Injectable()
export class AiRetentionJob {
  constructor(private readonly retention: AiRetentionService) {}

  run(): Promise<AiRetentionResult> {
    return this.retention.run();
  }
}
