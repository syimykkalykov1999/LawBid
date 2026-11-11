import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminLaunchModule } from '../admin-launch/admin-launch.module';
import { StaffHomeCoreModule } from '../staff-home/staff-home.module';
import { AdminAiAssistantController } from './admin-ai-assistant.controller';
import { AiAssistantWorkflowController } from './ai-assistant-workflow.controller';
import { AiAssistantService } from './ai-assistant.service';

/** 09.11.2026: the AI assistant (docs/runbooks/AI_ASSISTANT.md). */
@Module({
  imports: [AdminAccessModule, AdminLaunchModule, StaffHomeCoreModule],
  controllers: [AdminAiAssistantController, AiAssistantWorkflowController],
  providers: [AiAssistantService],
})
export class AiAssistantModule {}
