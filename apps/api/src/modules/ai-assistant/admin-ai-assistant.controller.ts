import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
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
  AiPullClosedDto,
  AiPullListDto,
  AiPullMergedDto,
  AiTaskCreatedDto,
  ApproveAiPullDto,
  CreateAiTaskDto,
  RejectAiPullDto,
} from './ai-assistant.dto';
import {
  AiAssistantError,
  AiAssistantService,
  AiPullError,
} from './ai-assistant.service';

/** AiPullError → the API error envelope (code + the owner's words). */
function pullHttp(e: unknown): never {
  if (!(e instanceof AiPullError)) throw e;
  if (e.reason === 'not_found') {
    throw new HttpException(
      { code: E.NOT_FOUND, message: e.message },
      HttpStatus.NOT_FOUND,
    );
  }
  throw new HttpException(
    { code: E.FEATURE_DISABLED, message: e.message },
    HttpStatus.CONFLICT,
  );
}

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

  // flag: none super-admin only; merging always needs the owner's 2FA
  @Get('pulls')
  @ApiOperation({
    summary: 'AI assistant: its open PRs (ai/… branches), CI and cost',
  })
  @ApiEnvelopeResponse(AiPullListDto)
  async listAiPulls(): Promise<AiPullListDto> {
    return this.ai.pulls();
  }

  /**
   * 12.11.2026 «Разрешить»: a fresh 2FA code, then the service re-checks
   * everything on GitHub (CI green, path guard, the sha the owner saw, one
   * merge at a time) and squash-merges pinned to that sha.
   */
  // flag: none super-admin only; merging always needs the owner's 2FA
  @Post('pulls/:n/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI assistant: merge its PR (needs a fresh 2FA code)',
  })
  @ApiEnvelopeResponse(AiPullMergedDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async approveAiPull(
    @CurrentAdmin() admin: AdminActor,
    @Param('n', ParseIntPipe) n: number,
    @Body() dto: ApproveAiPullDto,
  ): Promise<AiPullMergedDto> {
    await this.auth.assertStepUp(admin.sessionId);
    try {
      return await this.ai.approvePull(
        { id: admin.id, ip: admin.ip },
        n,
        dto.headSha,
      );
    } catch (e) {
      pullHttp(e);
    }
  }

  // flag: none super-admin only
  @Post('pulls/:n/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI assistant: close its PR with a comment' })
  @ApiEnvelopeResponse(AiPullClosedDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  async rejectAiPull(
    @CurrentAdmin() admin: AdminActor,
    @Param('n', ParseIntPipe) n: number,
    @Body() dto: RejectAiPullDto,
  ): Promise<AiPullClosedDto> {
    try {
      return await this.ai.rejectPull(
        { id: admin.id, ip: admin.ip },
        n,
        dto.reason,
      );
    } catch (e) {
      pullHttp(e);
    }
  }
}
