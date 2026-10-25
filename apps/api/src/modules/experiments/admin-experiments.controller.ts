import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminExperimentsService } from './admin-experiments.service';
import {
  CreateExperimentDto,
  ExperimentDto,
  ExperimentIdParamDto,
  StartExperimentDto,
  StopExperimentDto,
} from './admin-experiments.dto';

const E = ErrorCode;

/**
 * Admin → Система → Эксперименты (owner 2026-10-25). Owner only
 * (super_admin). Start, ramp and stop need a fresh 2FA code and no second
 * admin. Every change is written to the audit log by the service.
 */
@ApiTags('admin-experiments')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/experiments')
export class AdminExperimentsController {
  constructor(
    private readonly experiments: AdminExperimentsService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Experiments with their latest report' })
  @ApiEnvelopeResponse(ExperimentDto, { isArray: true })
  list(): Promise<ExperimentDto[]> {
    return this.experiments.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Create an experiment (draft: changes nothing yet)',
  })
  @ApiEnvelopeResponse(ExperimentDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.EXPERIMENT_STATE_INVALID] })
  create(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateExperimentDto,
  ): Promise<ExperimentDto> {
    return this.experiments.create(admin, dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a draft at a small share of users (2FA)' })
  @ApiEnvelopeResponse(ExperimentDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.EXPERIMENT_STATE_INVALID],
  })
  async start(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ExperimentIdParamDto,
    @Body() dto: StartExperimentDto,
  ): Promise<ExperimentDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.experiments.start(admin, p.id, dto.trafficPercent);
  }

  @Post(':id/traffic')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Raise the share of a running experiment (2FA)' })
  @ApiEnvelopeResponse(ExperimentDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.EXPERIMENT_STATE_INVALID],
  })
  async traffic(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ExperimentIdParamDto,
    @Body() dto: StartExperimentDto,
  ): Promise<ExperimentDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.experiments.setTraffic(admin, p.id, dto.trafficPercent);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop = roll back to the default behaviour (2FA)' })
  @ApiEnvelopeResponse(ExperimentDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.EXPERIMENT_STATE_INVALID] })
  async stop(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ExperimentIdParamDto,
    @Body() dto: StopExperimentDto,
  ): Promise<ExperimentDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.experiments.stop(admin, p.id, dto.reason);
  }

  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute the report now' })
  @ApiEnvelopeResponse(ExperimentDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  refresh(@Param() p: ExperimentIdParamDto): Promise<ExperimentDto> {
    return this.experiments.refresh(p.id);
  }
}
