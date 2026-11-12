import { Injectable } from '@nestjs/common';
import { AiWorkerService } from '../../modules/ai-worker/ai-worker.service';

/**
 * Owner 2026-11-12 «ИИ-сотрудник»: cron job `ai-worker.tick` (every 5 min).
 * Moves each background run one step: collect a finished Message Batch, or
 * submit the next chunk. With the master switch `staff.ai_enabled` off it
 * returns at once (no AI call); with no active run it is one indexed query.
 */
@Injectable()
export class AiWorkerTickJob {
  constructor(private readonly worker: AiWorkerService) {}

  run(): Promise<Record<string, number | string>> {
    return this.worker.tick();
  }
}
