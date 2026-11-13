import { Module } from '@nestjs/common';
import { AiWorkerTickJob } from '../../jobs/handlers/ai-worker-tick.job';
import { StaffAiCoreModule } from '../staff-ai/staff-ai.module';
import { AiWorkerController } from './ai-worker.controller';
import { AiWorkerQueues } from './ai-worker.queues';
import { AiWorkerService } from './ai-worker.service';

/**
 * Owner 2026-11-12 «ИИ-сотрудник» (docs/runbooks/AI_WORKER.md). Core part
 * (service + the `ai-worker.tick` job) for the API and the worker; it uses
 * the one Claude transport of staff AI mode (StaffAiClient).
 */
@Module({
  imports: [StaffAiCoreModule],
  providers: [AiWorkerQueues, AiWorkerService, AiWorkerTickJob],
  exports: [AiWorkerService, AiWorkerTickJob],
})
export class AiWorkerCoreModule {}

/** The owner-only admin routes (API only). */
@Module({
  imports: [AiWorkerCoreModule],
  controllers: [AiWorkerController],
})
export class AiWorkerModule {}
