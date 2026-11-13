import { Module } from '@nestjs/common';
import { AiWorkerTickJob } from '../../jobs/handlers/ai-worker-tick.job';
import { AiAttachmentsCoreModule } from '../ai-attachments/ai-attachments.module';
import { StaffAiCoreModule } from '../staff-ai/staff-ai.module';
import { SupportModule } from '../support/support.module';
import { VerificationModule } from '../verification/verification.module';
import { AiWorkerController } from './ai-worker.controller';
import { AiWorkerQueues } from './ai-worker.queues';
import { AiWorkerSources } from './ai-worker.sources';
import { AiWorkerService } from './ai-worker.service';

/**
 * Owner 2026-11-12 «ИИ-сотрудник» (docs/runbooks/AI_WORKER.md). Core part
 * (service + the `ai-worker.tick` job) for the API and the worker; it uses
 * the one Claude transport of staff AI mode (StaffAiClient).
 */
@Module({
  // AiAttachmentsCoreModule: the owner's pictures on roles / corrections.
  // SupportModule: an approved support reply is sent the support page's
  // way; VerificationModule: the official bar registries (row 50).
  // ModerationService (complaints) comes from the global ModerationModule.
  imports: [
    StaffAiCoreModule,
    AiAttachmentsCoreModule,
    SupportModule,
    VerificationModule,
  ],
  providers: [
    AiWorkerSources,
    AiWorkerQueues,
    AiWorkerService,
    AiWorkerTickJob,
  ],
  exports: [AiWorkerService, AiWorkerTickJob],
})
export class AiWorkerCoreModule {}

/** The owner-only admin routes (API only). */
@Module({
  imports: [AiWorkerCoreModule],
  controllers: [AiWorkerController],
})
export class AiWorkerModule {}
