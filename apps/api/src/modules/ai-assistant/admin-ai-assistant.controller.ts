import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  AiAssistantStatusDto,
  AiTaskCreatedDto,
  CreateAiTaskDto,
} from './ai-assistant.dto';
import { AiAssistantError, AiAssistantService } from './ai-assistant.service';

/**
 * 09.11.2026: Система → «Задача для ИИ». The super admin writes a task, it
 * becomes an `ai-task` issue, the GitHub workflow does it and opens a PR; the
 * page shows the issue, its PR and what each run cost.
 */
@ApiTags('admin-ai-assistant')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/ai-assistant')
export class AdminAiAssistantController {
  constructor(
    private readonly ai: AiAssistantService,
    private readonly auth: AdminAuthService,
  ) {}

  // flag: none super-admin only, gated by ai.assistant_mode
  @Get()
  @ApiOperation({ summary: 'AI assistant: switch, money, tasks and runs' })
  @ApiEnvelopeResponse(AiAssistantStatusDto)
  async getAiAssistant(): Promise<AiAssistantStatusDto> {
    return this.ai.status();
  }

  // flag: none super-admin only, gated by ai.assistant_mode
  @Post('tasks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI assistant: open a task (GitHub issue)' })
  @ApiEnvelopeResponse(AiTaskCreatedDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async createAiTask(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateAiTaskDto,
  ): Promise<AiTaskCreatedDto> {
    await this.auth.assertStepUp(admin.sessionId);
    try {
      return await this.ai.createTask({ id: admin.id, ip: admin.ip }, dto);
    } catch (e) {
      if (e instanceof AiAssistantError) {
        throw new HttpException(
          { code: E.FEATURE_DISABLED, message: e.message },
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
  }
}
