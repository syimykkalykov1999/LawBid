import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { Public } from '../../auth/decorators/public.decorator';
import { InfraChangeService } from './infra-change.service';
import { infraHttp } from './infra-errors';
import {
  InfraAuthError,
  InfraGithubClient,
  type WorkflowCaller,
} from './infra-github.client';
import {
  InfraDecisionDto,
  InfraJobDto,
  InfraPlanReportDto,
  InfraRequestDto,
  InfraStatusReportDto,
} from './infra.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-26: the `infra-apply` GitHub workflow talks to the API
 * here. No user session: every call carries the job's GitHub Actions OIDC
 * token (audience lawbid-infra-apply), checked against GitHub's keys, the
 * repository, the workflow file and refs/heads/main (InfraGithubClient).
 * Anything else is a plain 401. Not part of the app / admin contract (CI
 * only), so excluded from the OpenAPI document.
 */
@ApiExcludeController()
@ApiTags('infra-workflow')
@Public()
@Controller('infra/workflow/requests')
export class InfraWorkflowController {
  constructor(
    private readonly infra: InfraChangeService,
    private readonly github: InfraGithubClient,
  ) {}

  private async caller(auth: string | undefined): Promise<WorkflowCaller> {
    try {
      return await this.github.verifyCaller(auth);
    } catch (e) {
      if (e instanceof InfraAuthError) {
        throw new HttpException(
          { code: E.UNAUTHORIZED, message: 'Not the infra-apply workflow.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw e;
    }
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Workflow: take the job (what to write)' })
  @ApiEnvelopeResponse(InfraJobDto)
  @ApiErrors({
    401: [E.UNAUTHORIZED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async infraJobStart(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InfraJobDto> {
    const c = await this.caller(auth);
    try {
      return await this.infra.jobStart(id, c);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Post(':id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Workflow: the plan summary (resources +/−)' })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({
    401: [E.UNAUTHORIZED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async infraPlanReady(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InfraPlanReportDto,
  ): Promise<InfraRequestDto> {
    const c = await this.caller(auth);
    try {
      return await this.infra.planReady(id, c, dto);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Get(':id/decision')
  @ApiOperation({ summary: 'Workflow: wait, apply or stop' })
  @ApiEnvelopeResponse(InfraDecisionDto)
  @ApiErrors({
    401: [E.UNAUTHORIZED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async infraDecision(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InfraDecisionDto> {
    const c = await this.caller(auth);
    try {
      return await this.infra.decision(id, c);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Workflow: applying / done / failed' })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({
    401: [E.UNAUTHORIZED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async infraStatus(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InfraStatusReportDto,
  ): Promise<InfraRequestDto> {
    const c = await this.caller(auth);
    try {
      return await this.infra.report(id, c, dto);
    } catch (e) {
      infraHttp(e);
    }
  }
}
