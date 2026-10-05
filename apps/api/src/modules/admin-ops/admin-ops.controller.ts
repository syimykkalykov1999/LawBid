import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { AwsOpsService } from '../../common/ops/aws-ops.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  HeavyJobsDto,
  ScaleDto,
  SystemHealthDto,
  UpdateOpsSettingsDto,
} from './admin-ops.dto';
import { SystemHealthService } from './system-health.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05: Система → «Здоровье системы» (super_admin only). The
 * traffic lights, the automatic-reaction switches and the few buttons an
 * owner may need. Buttons that touch AWS (restart, scale) need a fresh
 * 2FA code; every action is audited.
 */
@ApiTags('admin-ops')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/system-health')
export class AdminOpsController {
  constructor(
    private readonly health: SystemHealthService,
    private readonly state: OpsStateService,
    private readonly aws: AwsOpsService,
    private readonly writer: AppSettingsWriter,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Traffic lights of every part of the system' })
  @ApiEnvelopeResponse(SystemHealthDto)
  getSystemHealth(): Promise<SystemHealthDto> {
    return this.health.report();
  }

  @Post('restart-worker')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace the background worker (needs step-up)' })
  @ApiEnvelopeResponse(SystemHealthDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async restartOpsWorker(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SystemHealthDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireAws();
    await this.aws.restartWorker();
    await this.log(admin, 'ops.restart_worker', null);
    return this.health.report();
  }

  @Post('heavy-jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause / resume heavy background jobs' })
  @ApiEnvelopeResponse(SystemHealthDto)
  async setHeavyJobsPaused(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: HeavyJobsDto,
  ): Promise<SystemHealthDto> {
    await this.state.setHeavyPaused(dto.paused, 'owner', 'owner button');
    await this.log(admin, 'ops.heavy_jobs', { paused: dto.paused });
    return this.health.report();
  }

  @Post('scale')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cap autoscaling at the minimum / back to normal (needs step-up)',
  })
  @ApiEnvelopeResponse(SystemHealthDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async setOpsScale(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ScaleDto,
  ): Promise<SystemHealthDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireAws();
    await this.aws.setScale(dto.mode);
    await this.state.setScaleMode({
      mode: dto.mode,
      by: 'owner',
      at: new Date().toISOString(),
    });
    await this.log(admin, 'ops.scale', { mode: dto.mode });
    return this.health.report();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Switch the automatic reactions on / off' })
  @ApiEnvelopeResponse(SystemHealthDto)
  async updateOpsSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateOpsSettingsDto,
  ): Promise<SystemHealthDto> {
    await this.writer.write(admin.id, 'ops.settings', {
      'ops.auto_pause_heavy_jobs': dto.autoPauseHeavyJobs,
      'ops.auto_scale_down_on_budget': dto.autoScaleDownOnBudget,
    });
    return this.health.report();
  }

  private requireAws(): void {
    if (!this.aws.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This button works only on AWS (production / staging).',
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private log(
    admin: AdminActor,
    action: string,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'system',
      targetId: null,
      before: null,
      after: after as Record<string, string> | null,
      ip: admin.ip,
    });
  }
}
