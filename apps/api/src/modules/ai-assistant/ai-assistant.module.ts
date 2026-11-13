import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminLaunchModule } from '../admin-launch/admin-launch.module';
import { AiAttachmentsCoreModule } from '../ai-attachments/ai-attachments.module';
import { StaffHomeCoreModule } from '../staff-home/staff-home.module';
import { AdminAiAssistantController } from './admin-ai-assistant.controller';
import { AiAssistantWorkflowController } from './ai-assistant-workflow.controller';
import { AiAssistantService } from './ai-assistant.service';
import { SentryWebhookController } from './sentry-webhook.controller';

/** 09.11.2026: the AI assistant (docs/runbooks/AI_ASSISTANT.md).
 * 12.11.2026: alarms (ops/status/alarm-events) and new Sentry errors start
 * it at once through AiAssistantService.trigger. */
@Module({
  imports: [
    AdminAccessModule,
    AdminLaunchModule,
    StaffHomeCoreModule,
    // Owner 2026-11-12: the owner's pictures for a task (row 48).
    AiAttachmentsCoreModule,
  ],
  controllers: [
    AdminAiAssistantController,
    AiAssistantWorkflowController,
    SentryWebhookController,
  ],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
