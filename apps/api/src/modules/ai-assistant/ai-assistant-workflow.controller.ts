import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import {
  InfraAuthError,
  InfraGithubClient,
  type WorkflowCaller,
} from '../admin-launch/infra/infra-github.client';
import { AI_OIDC_AUDIENCE, AI_WORKFLOW_FILE } from './ai-assistant.logic';
import { AiAssistantService } from './ai-assistant.service';

export class AiRunReportDto {
  @IsIn(['task', 'schedule'])
  kind!: 'task' | 'schedule';

  @IsOptional()
  @IsInt()
  @Min(1)
  issueNumber?: number;

  @IsOptional()
  costUsd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  conclusion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  prUrl?: string;
}

/**
 * 09.11.2026: `.github/workflows/ai-assistant.yml` talks to the API here,
 * with its GitHub Actions OIDC token (audience lawbid-ai-assistant), checked
 * like the infra pipeline's (repository, this workflow file, main). No shared
 * secret exists. CI only, so left out of the OpenAPI document.
 */
@ApiExcludeController()
@Public()
@Controller('ai-assistant/workflow')
export class AiAssistantWorkflowController {
  constructor(
    private readonly ai: AiAssistantService,
    private readonly github: InfraGithubClient,
  ) {}

  private async caller(auth: string | undefined): Promise<WorkflowCaller> {
    try {
      return await this.github.verifyCaller(auth, {
        file: AI_WORKFLOW_FILE,
        audience: AI_OIDC_AUDIENCE,
      });
    } catch (e) {
      if (e instanceof InfraAuthError) {
        throw new HttpException(
          { code: E.UNAUTHORIZED, message: 'Not the ai-assistant workflow.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw e;
    }
  }

  /** «May I run?» — the switch, the connection and the money left. */
  // flag: none CI-only route (GitHub OIDC), gated by ai.assistant_mode
  @Post('gate')
  @HttpCode(HttpStatus.OK)
  async aiWorkflowGate(@Headers('authorization') auth: string | undefined) {
    await this.caller(auth);
    const g = await this.ai.gate();
    return {
      allowed: g.allowed,
      reason: g.reasonText,
      leftUsd: g.leftUsd,
      monthUsd: g.monthUsd,
      maxUsd: g.maxUsd,
    };
  }

  /** What the scheduled run looks at (no personal data). */
  // flag: none CI-only route (GitHub OIDC), gated by ai.assistant_mode
  @Post('digest')
  @HttpCode(HttpStatus.OK)
  async aiWorkflowDigest(@Headers('authorization') auth: string | undefined) {
    await this.caller(auth);
    return this.ai.digest();
  }

  /** A run's cost and result. */
  // flag: none CI-only route (GitHub OIDC), gated by ai.assistant_mode
  @Post('report')
  @HttpCode(HttpStatus.OK)
  async aiWorkflowReport(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: AiRunReportDto,
  ) {
    const run = await this.caller(auth);
    return this.ai.report(run, dto);
  }
}
